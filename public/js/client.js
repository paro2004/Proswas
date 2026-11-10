document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('xray_image');
    const imagePreview = document.getElementById('imagePreview');
    const previewContainer = document.getElementById('previewContainer');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const form = document.getElementById('diagnosticForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const btnSpinner = document.getElementById('btnSpinner');

    // Instant local image preview on file select
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    imagePreview.src = event.target.result;
                    uploadPlaceholder.classList.add('d-none');
                    previewContainer.classList.remove('d-none');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Submit button loading animation
    if (form) {
        form.addEventListener('submit', () => {
            if (submitBtn) {
                submitBtn.disabled = true;
                btnText.textContent = 'Processing radiograph...';
                btnSpinner.classList.remove('d-none');
            }
        });
    }
});