import io
import base64
import os
from flask import Flask, request, jsonify
from PIL import Image
from model import PneumoniaDiagnosticService

app = Flask(__name__)

# Resolve checkpoint path
MODEL_PATH = os.path.join(os.path.dirname(__file__), "resnet18_pneumonia.pth")

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Missing weights file: {MODEL_PATH}. "
        f"Please place 'resnet18_pneumonia.pth' inside the ai_service/ directory."
    )

# Initialize model and Grad-CAM hooks
service = PneumoniaDiagnosticService(MODEL_PATH)

@app.route('/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Empty filename"}), 400

    try:
        # Load the uploaded radiograph directly in RAM (zero disk storage)
        img = Image.open(file.stream).convert('RGB')
        
        # Run inference and generate Grad-CAM visualization
        result = service.predict(img)

        # Encode the blended Grad-CAM overlay image to Base64
        buffered = io.BytesIO()
        Image.fromarray(result['overlay_array']).save(buffered, format="JPEG")
        overlay_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

        return jsonify({
            "prediction": result["prediction"],
            "confidence_percent": result["confidence_percent"],
            "overlay_base64": overlay_base64
        }), 200

    except Exception as e:
        return jsonify({"error": f"Inference failed: {str(e)}"}), 500

if __name__ == '__main__':
    print("Starting Proshwas AI Engine on http://127.0.0.1:5000 ...")
    app.run(host='127.0.0.1', port=5000, debug=False)