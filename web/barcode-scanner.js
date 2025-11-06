// barcode-scanner.js
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const barcodeButton = document.getElementById('barcodeButton');

    if (!searchInput || !barcodeButton) {
        console.error('Elementos do scanner não encontrados');
        return;
    }

    // Verificar se a API de câmera é suportada
    const isCameraSupported = () => {
        return 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
    };

    // Inicializar leitor de código de barras
    const initBarcodeScanner = async () => {
        if (!isCameraSupported()) {
            alert('Seu navegador não suporta acesso à câmera. Tente usar o Chrome ou Safari.');
            return;
        }

        try {
            // Solicitar permissão da câmera
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });

            // Criar interface do scanner
            createScannerUI(stream);
        } catch (error) {
            console.error('Erro ao acessar câmera:', error);
            if (error.name === 'NotAllowedError') {
                alert('Permissão de câmera negada. Por favor, permita o acesso à câmera nas configurações do seu navegador.');
            } else if (error.name === 'NotFoundError') {
                alert('Nenhuma câmera encontrada no dispositivo.');
            } else {
                alert('Não foi possível acessar a câmera. Verifique as permissões.');
            }
        }
    };

    // Criar interface do scanner
    const createScannerUI = (stream) => {
        // Criar elementos do modal
        const scannerModal = document.createElement('div');
        scannerModal.className = 'scanner-modal';
        scannerModal.innerHTML = `
            <div class="scanner-container">
                <div class="scanner-header">
                    <h3>Scanner de Código de Barras</h3>
                    <button class="close-scanner">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="scanner-body">
                    <video id="scannerVideo" autoplay playsinline></video>
                    <div class="scanner-overlay">
                        <div class="scan-frame"></div>
                        <p>Posicione o código de barras dentro do quadro</p>
                    </div>
                </div>
                <div class="scanner-status" id="scannerStatus">
                    Preparando câmera...
                </div>
                <div class="scanner-footer">
                    <button class="btn outline" id="toggleTorch">
                        <i class="fas fa-lightbulb"></i> Luz
                    </button>
                    <button class="btn" id="manualInput">
                        <i class="fas fa-keyboard"></i> Inserir Manualmente
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(scannerModal);

        // Configurar vídeo
        const video = document.getElementById('scannerVideo');
        const statusElement = document.getElementById('scannerStatus');
        video.srcObject = stream;

        video.addEventListener('loadeddata', () => {
            statusElement.textContent = 'Aponte para um código de barras...';
        });

        // Inicializar QuaggaJS para leitura de código de barras
        initQuaggaJS(video, scannerModal, statusElement);

        // Event listeners
        const closeBtn = scannerModal.querySelector('.close-scanner');
        const toggleTorch = scannerModal.querySelector('#toggleTorch');
        const manualInput = scannerModal.querySelector('#manualInput');

        closeBtn.addEventListener('click', () => closeScanner(scannerModal, stream));
        scannerModal.addEventListener('click', (e) => {
            if (e.target === scannerModal) closeScanner(scannerModal, stream);
        });

        // Controle de flashlight (se disponível)
        let torchOn = false;
        toggleTorch.addEventListener('click', () => {
            torchOn = !torchOn;
            toggleFlashlight(stream, torchOn);
            toggleTorch.innerHTML = torchOn ? 
                '<i class="fas fa-lightbulb"></i> Desligar Luz' : 
                '<i class="fas fa-lightbulb"></i> Ligar Luz';
        });

        // Entrada manual
        manualInput.addEventListener('click', () => {
            const barcode = prompt('Digite o código de barras:');
            if (barcode && barcode.trim()) {
                searchInput.value = barcode.trim();
                closeScanner(scannerModal, stream);
                showBarcodeNotification(`Código inserido: ${barcode.trim()}`);
            }
        });
    };

    // Inicializar QuaggaJS para decodificação
    const initQuaggaJS = (video, modal, statusElement) => {
        const Quagga = window.Quagga;

        if (!Quagga) {
            console.error('QuaggaJS não carregado');
            statusElement.textContent = 'Erro: Biblioteca de scanner não carregada';
            statusElement.style.color = 'var(--error)';
            return;
        }

        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: video,
                constraints: {
                    facingMode: "environment",
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 }
                }
            },
            decoder: {
                readers: [
                    "ean_reader",
                    "ean_8_reader",
                    "code_128_reader",
                    "upc_reader",
                    "upc_e_reader"
                ]
            },
            locator: {
                patchSize: "medium",
                halfSample: true
            },
            locate: true,
            frequency: 10
        }, (err) => {
            if (err) {
                console.error('Erro ao inicializar Quagga:', err);
                statusElement.textContent = 'Erro ao iniciar scanner';
                statusElement.style.color = 'var(--error)';
                return;
            }

            Quagga.start();
            statusElement.textContent = 'Scanner ativo - Aponte para um código de barras';

            // Detectar código de barras
            Quagga.onDetected((result) => {
                const code = result.codeResult.code;
                if (code) {
                    statusElement.textContent = `Código detectado: ${code}`;
                    statusElement.style.color = 'var(--success)';

                    // Inserir código no campo de busca IMEDIATAMENTE
                    searchInput.value = code;

                    // Disparar evento de input para atualizar qualquer listener
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

                    // Fechar scanner após breve delay para mostrar o código detectado
                    setTimeout(() => {
                        Quagga.stop();
                        closeScanner(modal, video.srcObject);
                        showBarcodeNotification(`Código lido: ${code}`);
                    }, 1000);
                }
            });
        });
    };

    // Fechar scanner
    const closeScanner = (modal, stream) => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        if (window.Quagga) {
            Quagga.stop();
        }

        if (modal && modal.parentNode) {
            modal.remove();
        }
    };

    // Alternar flashlight
    const toggleFlashlight = async (stream, turnOn) => {
        const track = stream.getVideoTracks()[0];
        if (!track || !track.getCapabilities || !track.getCapabilities().torch) {
            console.log('Flashlight não suportado neste dispositivo');
            return;
        }

        try {
            await track.applyConstraints({
                advanced: [{ torch: turnOn }]
            });
        } catch (error) {
            console.log('Erro ao controlar flashlight:', error);
        }
    };

    // Mostrar notificação personalizada para código de barras
    const showBarcodeNotification = (message) => {
        // Reutiliza a função showNotification se existir, senão cria uma básica
        if (typeof showNotification === 'function') {
            showNotification(message, 'success');
        } else {
            // Criar notificação básica
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--success);
                color: white;
                padding: 1rem;
                border-radius: 8px;
                z-index: 10001;
                max-width: 300px;
            `;
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 3000);
        }
    };

    // Event listener para o botão da câmera
    barcodeButton.addEventListener('click', initBarcodeScanner);
});