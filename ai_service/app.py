import io
import os
import base64
import urllib.request
import numpy as np
import cv2
from PIL import Image
from flask import Flask, request, jsonify
import torch
import torch.nn as nn
from torchvision import models, transforms

app = Flask(__name__)

DEVICE = torch.device('cpu')
CLASS_NAMES = ['NORMAL', 'PNEUMONIA']
CONFIDENCE_THRESHOLD = 0.60

possible_model_paths = [
    os.path.join(os.path.dirname(__file__), 'resnet18_pneumonia.pth'),
    'resnet18_pneumonia.pth',
    '/opt/render/project/src/ai_service/resnet18_pneumonia.pth',
    'ai_service/resnet18_pneumonia.pth'
]

MODEL_URL = "https://github.com/paro2004/Proshwas/raw/main/ai_service/resnet18_pneumonia.pth"
MODEL_PATH = 'resnet18_pneumonia.pth'

def ensure_model_weights():
    global MODEL_PATH
    for path in possible_model_paths:
        if os.path.exists(path):
            MODEL_PATH = path
            print(f"Found model weights at: {MODEL_PATH}")
            return
    
    print(f"Model weights not found locally. Downloading from repository...")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Model weights downloaded successfully!")
    except Exception as e:
        print(f"Warning: Could not auto-download weights: {e}")

ensure_model_weights()

preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

def build_model():
    model = models.resnet18(weights=None)
    num_ftrs = model.fc.in_features
    
    # Correct structure matching your checkpoint: 128 hidden units, 1 single output class
    model.fc = nn.Sequential(
        nn.Linear(num_ftrs, 128),
        nn.ReLU(),
        nn.Dropout(0.5),
        nn.Linear(128, 1)
    )

    if os.path.exists(MODEL_PATH):
        state_dict = torch.load(MODEL_PATH, map_location=DEVICE)
        model.load_state_dict(state_dict)
        print("Model weights loaded successfully into ResNet-18!")
    else:
        raise FileNotFoundError(f"Model weights could not be loaded at {MODEL_PATH}")

    model.to(DEVICE)
    model.eval()
    return model

model = build_model()

def is_valid_radiograph(pil_image):
    img_rgb = np.array(pil_image.convert('RGB'), dtype=np.float32)
    r, g, b = img_rgb[:, :, 0], img_rgb[:, :, 1], img_rgb[:, :, 2]
    color_variation = np.mean(np.abs(r - g)) + np.mean(np.abs(r - b)) + np.mean(np.abs(g - b))

    if color_variation > 10.0:
        return False, "Color photo detected. Please upload a valid grayscale chest X-ray."

    gray = np.mean(img_rgb, axis=2)
    if np.std(gray) < 15.0:
        return False, "Low contrast image detected. Please upload a clear chest radiograph."

    return True, None

def generate_gradcam(model, input_tensor, target_class_idx, original_pil):
    gradients = []
    activations = []

    def forward_hook(module, inp, out):
        activations.append(out.detach())

    def backward_hook(module, grad_in, grad_out):
        gradients.append(grad_out[0].detach())

    target_layer = model.layer4[-1]
    fwd_handle = target_layer.register_forward_hook(forward_hook)
    bwd_handle = target_layer.register_full_backward_hook(backward_hook)

    try:
        model.zero_grad()
        output = model(input_tensor)
        score = output[0, 0]
        score.backward()

        grads = gradients[0][0]
        acts = activations[0][0]
        weights = torch.mean(grads, dim=(1, 2))
        cam = torch.zeros(acts.shape[1:], dtype=torch.float32)

        for i, w in enumerate(weights):
            cam += w * acts[i]

        cam = torch.relu(cam).cpu().numpy()
        if np.max(cam) > 0:
            cam = cam / np.max(cam)

        orig_np = np.array(original_pil.convert('RGB'))
        h, w, _ = orig_np.shape
        heatmap = cv2.resize(cam, (w, h))
        heatmap_uint8 = np.uint8(255 * heatmap)
        heatmap_color = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
        heatmap_color = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)

        overlay = cv2.addWeighted(orig_np, 0.6, heatmap_color, 0.4, 0)
        overlay_pil = Image.fromarray(overlay)
        buf = io.BytesIO()
        overlay_pil.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('utf-8')

    finally:
        fwd_handle.remove()
        bwd_handle.remove()

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({'status': 'online', 'service': 'Proshwas AI Engine'}), 200

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

        is_valid, error_message = is_valid_radiograph(pil_image)
        if not is_valid:
            return jsonify({'error': error_message}), 400

        rgb_image = pil_image.convert('RGB')
        input_tensor = preprocess(rgb_image).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            logits = model(input_tensor)
            prob = torch.sigmoid(logits).item()

        if prob >= CONFIDENCE_THRESHOLD:
            prediction = 'PNEUMONIA'
            confidence_percent = round(prob * 100, 1)
        else:
            prediction = 'NORMAL'
            confidence_percent = round((1 - prob) * 100, 1)

        overlay_base64 = generate_gradcam(model, input_tensor, 0, rgb_image)

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