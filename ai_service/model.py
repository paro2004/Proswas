import io
import numpy as np
import cv2
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as models
from torchvision import transforms
from PIL import Image

class PneumoniaDiagnosticService:
    def __init__(self, checkpoint_path, device=None):
        self.device = device or torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # ResNet-18 architecture matching your Colab training
        self.model = models.resnet18(weights=None)
        in_feats = self.model.fc.in_features
        self.model.fc = nn.Sequential(
            nn.Linear(in_feats, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, 1)
        )
        
        # Load your trained weights
        state_dict = torch.load(checkpoint_path, map_location=self.device)
        self.model.load_state_dict(state_dict)
        self.model = self.model.to(self.device)
        self.model.eval()

        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225])
        ])

        # Grad-CAM target hooks
        self.activations = None
        self.gradients = None
        self.target_layer = self.model.layer4[-1].conv2
        self.target_layer.register_forward_hook(self._save_activations)
        self.target_layer.register_full_backward_hook(self._save_gradients)

    def _save_activations(self, module, inp, outp):
        self.activations = outp

    def _save_gradients(self, module, grad_in, grad_out):
        self.gradients = grad_out[0]

    def _generate_cam(self, score):
        self.model.zero_grad()
        score.backward(retain_graph=True)

        if self.gradients is not None and self.activations is not None:
            alpha = torch.mean(self.gradients, dim=[2, 3], keepdim=True)
            cam = torch.sum(alpha * self.activations, dim=1, keepdim=True)
            cam = F.relu(cam).squeeze().detach().cpu().numpy()
        else:
            cam = np.zeros((7, 7), dtype=np.float32)

        cam_ptp = np.ptp(cam)
        if cam_ptp < 1e-5:
            cam_ptp = 1e-5
        cam = (cam - np.min(cam)) / (cam_ptp + 1e-8)
        return cam

    def predict(self, pil_img, threshold=0.5):
        rgb_img = pil_img.convert('RGB')
        tensor = self.transform(rgb_img).unsqueeze(0).to(self.device)

        with torch.set_grad_enabled(True):
            logit = self.model(tensor).squeeze()
            prob = torch.sigmoid(logit).item()
            cam_mask = self._generate_cam(logit)

        is_pneumonia = prob >= threshold
        pred_label = "PNEUMONIA" if is_pneumonia else "NORMAL"
        confidence = (prob if is_pneumonia else (1.0 - prob)) * 100.0

        # Create Grad-CAM overlay heatmap
        resized_orig = rgb_img.resize((320, 320))
        img_np = np.array(resized_orig, dtype=np.float32)

        cam_resized = cv2.resize(cam_mask, (320, 320), interpolation=cv2.INTER_CUBIC)
        cam_smooth = cv2.GaussianBlur(cam_resized, (25, 25), 0)
        cam_smooth = (cam_smooth - np.min(cam_smooth)) / (np.ptp(cam_smooth) + 1e-8)

        heatmap_uint8 = np.uint8(255 * cam_smooth)
        heatmap_bgr = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
        heatmap_rgb = cv2.cvtColor(heatmap_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)

        alpha = 0.45
        blended = (1.0 - alpha) * img_np + alpha * heatmap_rgb
        blended = np.clip(blended, 0, 255).astype(np.uint8)

        return {
            "prediction": pred_label,
            "confidence_percent": round(confidence, 1),
            "overlay_array": blended
        }