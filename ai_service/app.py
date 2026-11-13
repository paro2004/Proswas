import io
import os
import base64
import numpy as np
import cv2
from PIL import Image
from flask import Flask, request, jsonify
import torch
import torch.nn as nn
from torchvision import models, transforms

app = Flask(__name__)

# Configuration & Robust Model Path Resolution
DEVICE = torch.device('cpu')
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'pneumonia_resnet18.pth')
MODEL_PATH = os.environ.get('MODEL_PATH', DEFAULT_MODEL_PATH)
CLASS_NAMES = ['NORMAL', 'PNEUMONIA']
CONFIDENCE_THRESHOLD = 0.60  # Calibrated threshold to reduce false positives

# Preprocessing pipeline matching training validation transforms
preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


def build_model():
    """Initializes ResNet-18 architecture and loads trained weights."""
    model = models.resnet18(weights=None)
    num_ftrs = model.fc.in_features
    model.fc = nn.Linear(num_ftrs, 2)

    if os.path.exists(MODEL_PATH):
        state_dict = torch.load(MODEL_PATH, map_location=DEVICE)
        model.load_state_dict(state_dict)
    else:
        raise FileNotFoundError(f"Model weights not found at {MODEL_PATH}")

    model.to(DEVICE)
    model.eval()
    return model


model = build_model()


def is_valid_radiograph(pil_image):
    """
    Domain validation gatekeeper to reject non-medical/out-of-distribution images
    before passing tensors to the classifier.
    """
    img_rgb = np.array(pil_image.convert('RGB'), dtype=np.float32)

    # 1. Color channel variance check: X-rays are grayscale (R ~= G ~= B)
    r, g, b = img_rgb[:, :, 0], img_rgb[:, :, 1], img_rgb[:, :, 2]
    color_variation = (
        np.mean(np.abs(r - g)) +
        np.mean(np.abs(r - b)) +
        np.mean(np.abs(g - b))
    )

    if color_variation > 10.0:
        return False, "Color photo detected. Please upload a valid grayscale chest X-ray."

    # 2. Contrast check: Reject blank, solid-color, or washed-out uploads
    gray = np.mean(img_rgb, axis=2)
    if np.std(gray) < 15.0:
        return False, "Low contrast image detected. Please upload a clear chest radiograph."

    return True, None


def generate_gradcam(model, input_tensor, target_class_idx, original_pil):
    """Generates a Grad-CAM heatmap overlay on the original radiograph."""
    gradients = []
    activations = []

    def forward_hook(module, inp, out):
        activations.append(out.detach())

    def backward_hook(module, grad_in, grad_out):
        gradients.append(grad_out[0].detach())

    # Hook into the final convolutional layer of ResNet-18
    target_layer = model.layer4[-1]
    fwd_handle = target_layer.register_forward_hook(forward_hook)
    bwd_handle = target_layer.register_full_backward_hook(backward_hook)

    try:
        model.zero_grad()
        output = model(input_tensor)
        score = output[0, target_class_idx]
        score.backward()

        grads = gradients[0][0]          # [C, H, W]
        acts = activations[0][0]         # [C, H, W]

        weights = torch.mean(grads, dim=(1, 2))  # Global average pooling over H, W
        cam = torch.zeros(acts.shape[1:], dtype=torch.float32)

        for i, w in enumerate(weights):
            cam += w * acts[i]

        cam = torch.relu(cam).cpu().numpy()
        if np.max(cam) > 0:
            cam = cam / np.max(cam)

        # Resize heatmap to match original uploaded image dimensions
        orig_np = np.array(original_pil.convert('RGB'))
        h, w, _ = orig_np.shape
        heatmap = cv2.resize(cam, (w, h))
        heatmap_uint8 = np.uint8(255 * heatmap)
        heatmap_color = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
        heatmap_color = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)

        # Blend original X-ray (60%) with Grad-CAM heatmap (40%)
        overlay = cv2.addWeighted(orig_np, 0.6, heatmap_color, 0.4, 0)

        # Encode overlay to Base64 PNG
        overlay_pil = Image.fromarray(overlay)
        buf = io.BytesIO()
        overlay_pil.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('utf-8')

    finally:
        fwd_handle.remove()
        bwd_handle.remove()


@app.route('/', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'online',
        'service': 'Proshwas AI Engine'
    }), 200


@app.route('/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({'error': 'No image file provided in request.'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Empty file selected.'}), 400

    try:
        image_bytes = file.read()
        pil_image = Image.open(io.BytesIO(image_bytes))

        # Step 1: Validate that the input is a genuine grayscale radiograph
        is_valid, error_message = is_valid_radiograph(pil_image)
        if not is_valid:
            return jsonify({'error': error_message}), 400

        # Step 2: Preprocess & Run Inference
        rgb_image = pil_image.convert('RGB')
        input_tensor = preprocess(rgb_image).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            logits = model(input_tensor)
            probs = torch.softmax(logits, dim=1)[0]
            pneumonia_prob = probs[1].item()
            normal_prob = probs[0].item()

        if pneumonia_prob >= CONFIDENCE_THRESHOLD:
            prediction = 'PNEUMONIA'
            confidence_percent = round(pneumonia_prob * 100, 1)
            target_idx = 1
        else:
            prediction = 'NORMAL'
            confidence_percent = round(normal_prob * 100, 1)
            target_idx = 0

        # Step 3: Generate Grad-CAM visualization
        overlay_base64 = generate_gradcam(model, input_tensor, target_idx, rgb_image)

        return jsonify({
            'prediction': prediction,
            'confidence_percent': confidence_percent,
            'overlay_base64': overlay_base64
        }), 200

    except Exception as e:
        return jsonify({'error': f'Inference error: {str(e)}'}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)