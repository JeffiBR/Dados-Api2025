class ProgressManager {
  constructor() {
      this.overlay = null;
      this.progressBar = null;
      this.percentageText = null;
      this.steps = {};
      this.timeStart = null;
      this.currentProgress = 0;
      this.totalSteps = 0;
      this.completedSteps = 0;
      this.isActive = false;

      this.initializeProgressOverlay();
  }

  initializeProgressOverlay() {
      // Criar overlay
      this.overlay = document.createElement('div');
      this.overlay.className = 'progress-overlay';
      this.overlay.innerHTML = `
          <div class="progress-modal">
              <div class="progress-header">
                  <i class="fas fa-chart-line"></i>
                  <h3>Comparando Preços</h3>
              </div>

              <div class="progress-stats">
                  <span id="progressPercentage">0%</span>
                  <span id="progressStats">0/0 produtos</span>
              </div>

              <div class="progress-bar-container">
                  <div class="progress-bar" id="mainProgressBar"></div>
              </div>

              <div class="progress-details">
                  <div class="progress-step" id="stepProduct">
                      <div class="step-icon" id="productIcon">1</div>
                      <div class="step-info">
                          <div class="step-label" id="productLabel">Produto atual</div>
                          <div class="step-value" id="productValue">-</div>
                      </div>
                  </div>

                  <div class="progress-step" id="stepMarket">
                      <div class="step-icon" id="marketIcon">2</div>
                      <div class="step-info">
                          <div class="step-label" id="marketLabel">Mercado atual</div>
                          <div class="step-value" id="marketValue">-</div>
                      </div>
                  </div>

                  <div class="progress-step" id="stepStatus">
                      <div class="step-icon" id="statusIcon">3</div>
                      <div class="step-info">
                          <div class="step-label" id="statusLabel">Status</div>
                          <div class="step-value" id="statusValue">Aguardando início...</div>
                      </div>
                  </div>
              </div>

              <div class="progress-time">
                  <span>Tempo decorrido: <span id="elapsedTime">0s</span></span>
                  <span class="time-estimate">Estimativa: <span id="estimatedTime">-</span></span>
              </div>

              <button class="btn outline small progress-cancel" id="cancelProgress">
                  <i class="fas fa-times"></i>
                  Cancelar Busca
              </button>
          </div>
      `;

      document.body.appendChild(this.overlay);

      // Referências aos elementos
      this.progressBar = document.getElementById('mainProgressBar');
      this.percentageText = document.getElementById('progressPercentage');
      this.statsText = document.getElementById('progressStats');
      this.elapsedTime = document.getElementById('elapsedTime');
      this.estimatedTime = document.getElementById('estimatedTime');

      // Elementos dos passos
      this.steps = {
          product: {
              icon: document.getElementById('productIcon'),
              label: document.getElementById('productLabel'),
              value: document.getElementById('productValue')
          },
          market: {
              icon: document.getElementById('marketIcon'),
              label: document.getElementById('marketLabel'),
              value: document.getElementById('marketValue')
          },
          status: {
              icon: document.getElementById('statusIcon'),
              label: document.getElementById('statusLabel'),
              value: document.getElementById('statusValue')
          }
      };

      // Event listener para cancelar
      document.getElementById('cancelProgress').addEventListener('click', () => {
          this.cancel();
      });
  }

  start(totalProducts, totalMarkets) {
      this.isActive = true;
      this.totalSteps = totalProducts;
      this.completedSteps = 0;
      this.currentProgress = 0;
      this.timeStart = Date.now();

      this.updateProgress(0);
      this.updateStep('product', 'Aguardando...', false);
      this.updateStep('market', 'Aguardando...', false);
      this.updateStep('status', 'Iniciando busca...', false);

      this.overlay.classList.add('active');
      this.startTimeUpdate();
  }

  updateProgress(progress) {
      if (!this.isActive) return;

      this.currentProgress = Math.min(progress, 100);
      this.progressBar.style.width = `${this.currentProgress}%`;
      this.percentageText.textContent = `${Math.round(this.currentProgress)}%`;
      this.statsText.textContent = `${this.completedSteps}/${this.totalSteps} produtos`;
  }

  updateStep(step, value, isActive = true, isCompleted = false) {
      if (!this.isActive) return;

      const stepElement = this.steps[step];
      if (!stepElement) return;

      stepElement.value.textContent = value;

      // Atualizar ícone
      stepElement.icon.className = 'step-icon';
      if (isCompleted) {
          stepElement.icon.classList.add('completed');
          stepElement.icon.innerHTML = '<i class="fas fa-check"></i>';
      } else if (isActive) {
          stepElement.icon.classList.add('active');
          stepElement.icon.innerHTML = '<div class="progress-loading"></div>';
      } else {
          stepElement.icon.textContent = this.getStepNumber(step);
      }

      // Atualizar label
      stepElement.label.className = 'step-label';
      if (isActive) {
          stepElement.label.classList.add('active');
      }
  }

  getStepNumber(step) {
      const steps = {
          product: '1',
          market: '2',
          status: '3'
      };
      return steps[step] || '?';
  }

  startTimeUpdate() {
      this.timeInterval = setInterval(() => {
          if (!this.isActive) {
              clearInterval(this.timeInterval);
              return;
          }

          const elapsed = Math.floor((Date.now() - this.timeStart) / 1000);
          this.elapsedTime.textContent = `${elapsed}s`;

          // Calcular tempo estimado
          if (this.currentProgress > 0) {
              const totalEstimated = Math.floor((elapsed * 100) / this.currentProgress);
              const remaining = totalEstimated - elapsed;
              this.estimatedTime.textContent = `${remaining}s`;
          }
      }, 1000);
  }

  productStart(productIndex, totalProducts, barcode) {
      this.completedSteps = productIndex;
      const progress = (productIndex / totalProducts) * 100;
      this.updateProgress(progress);

      this.updateStep('product', `Produto ${productIndex + 1} de ${totalProducts} (${barcode})`, true);
      this.updateStep('market', 'Processando mercados...', false);
      this.updateStep('status', 'Buscando preços...', true);
  }

  marketStart(marketName, marketIndex, totalMarkets) {
      this.updateStep('market', `${marketName} (${marketIndex + 1}/${totalMarkets})`, true);
      this.updateStep('status', 'Consultando preço...', true);
  }

  marketComplete(marketName) {
      this.updateStep('market', `${marketName} ✓`, false, true);
  }

  productComplete(productIndex, totalProducts) {
      this.completedSteps = productIndex + 1;
      const progress = (this.completedSteps / totalProducts) * 100;
      this.updateProgress(progress);

      this.updateStep('product', `Produto ${this.completedSteps} de ${totalProducts} ✓`, false, true);
      this.updateStep('market', 'Todos completos ✓', false, true);
      this.updateStep('status', 'Processando resultados...', true);
  }

  complete() {
      this.updateProgress(100);
      this.updateStep('status', 'Busca concluída!', false, true);

      setTimeout(() => {
          this.hide();
      }, 1000);
  }

  error(message) {
      this.updateStep('status', `Erro: ${message}`, false);
      this.steps.status.icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
      this.steps.status.icon.style.background = 'var(--error)';
  }

  cancel() {
      this.isActive = false;
      this.hide();

      // Disparar evento customizado para cancelamento
      const cancelEvent = new CustomEvent('progressCancel');
      document.dispatchEvent(cancelEvent);
  }

  hide() {
      this.isActive = false;
      if (this.timeInterval) {
          clearInterval(this.timeInterval);
      }
      this.overlay.classList.remove('active');
  }
}

// Instância global do gerenciador de progresso
const progressManager = new ProgressManager();