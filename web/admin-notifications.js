class AdminNotificationsManager {
  constructor() {
      this.currentPage = 1;
      this.pageSize = 10;
      this.totalPages = 1;
      this.searchTerm = '';
      this.editingId = null;
      this.users = [];

      this.init();
  }

  init() {
      console.log('Inicializando AdminNotificationsManager...');
      this.bindEvents();
      this.loadStats();
      this.loadUsers();
      this.loadNotifications();
      console.log('AdminNotificationsManager inicializado');
  }

  bindEvents() {
      // Form events
      document.getElementById('notificationForm').addEventListener('submit', (e) => this.handleSubmit(e));
      document.getElementById('cancelEdit').addEventListener('click', () => this.cancelEdit());

      // Recipient type toggle
      document.querySelectorAll('input[name="recipientType"]').forEach(radio => {
          radio.addEventListener('change', (e) => this.toggleRecipientType(e.target.value));
      });

      // User selection
      document.getElementById('selectAllUsers').addEventListener('click', () => this.selectAllUsers());
      document.getElementById('deselectAllUsers').addEventListener('click', () => this.deselectAllUsers());

      // Search and pagination
      document.getElementById('searchNotifications').addEventListener('input', (e) => this.handleSearch(e));
      document.getElementById('clearSearch').addEventListener('click', () => this.clearSearch());
      document.getElementById('prevPage').addEventListener('click', () => this.previousPage());
      document.getElementById('nextPage').addEventListener('click', () => this.nextPage());

      // Character counters
      document.getElementById('notificationTitle').addEventListener('input', (e) => this.updateCharCounter(e, 'titleCounter', 255));
      document.getElementById('notificationMessage').addEventListener('input', (e) => this.updateCharCounter(e, 'messageCounter', 1000));
  }

  async loadStats() {
      try {
          // Usar authenticatedFetch do auth.js
          const [notificationsRes, usersRes] = await Promise.all([
              authenticatedFetch('/api/admin/notifications?limit=1000'),
              authenticatedFetch('/api/users')
          ]);

          if (notificationsRes.ok && usersRes.ok) {
              const notifications = await notificationsRes.json();
              const users = await usersRes.json();

              const today = new Date().toISOString().split('T')[0];
              const sentToday = notifications.filter(n => 
                  n.created_at.startsWith(today)
              ).length;

              const unreadCount = notifications.reduce((count, notification) => {
                  return count + (notification.is_read ? 0 : 1);
              }, 0);

              document.getElementById('totalNotifications').textContent = notifications.length;
              document.getElementById('unreadNotifications').textContent = unreadCount;
              document.getElementById('sentToday').textContent = sentToday;
              document.getElementById('totalUsers').textContent = users.length;
          }
      } catch (error) {
          console.error('Erro ao carregar estatísticas:', error);
      }
  }

  async loadUsers() {
      try {
          console.log('Carregando usuários...');

          // Usar authenticatedFetch do auth.js
          const response = await authenticatedFetch('/api/users');

          if (!response.ok) {
              throw new Error(`Erro HTTP: ${response.status}`);
          }

          const users = await response.json();
          console.log('Usuários carregados:', users);

          this.users = users;
          this.renderUsers();

      } catch (error) {
          console.error('Erro ao carregar usuários:', error);
          this.showError('Erro ao carregar lista de usuários: ' + error.message);
      }
  }

  renderUsers() {
      const container = document.getElementById('userSelection');
      if (!container) {
          console.error('Container userSelection não encontrado');
          return;
      }

      container.innerHTML = '';

      if (!this.users || this.users.length === 0) {
          container.innerHTML = '<div class="empty-state"><p>Nenhum usuário encontrado</p></div>';
          return;
      }

      this.users.forEach(user => {
          const userElement = document.createElement('div');
          userElement.className = 'user-checkbox';
          userElement.innerHTML = `
              <input type="checkbox" id="user-${user.id}" value="${user.id}">
              <div class="user-info-small">
                  <span class="user-name-small">${this.escapeHtml(user.full_name || 'Nome não disponível')}</span>
                  <span class="user-email-small">${this.escapeHtml(user.email || 'Email não disponível')}</span>
              </div>
          `;
          container.appendChild(userElement);
      });

      console.log(`Renderizados ${this.users.length} usuários`);
  }

  async loadNotifications() {
      try {
          let url = `/api/admin/notifications?page=${this.currentPage}&limit=${this.pageSize}`;
          if (this.searchTerm) {
              url += `&search=${encodeURIComponent(this.searchTerm)}`;
          }

          // Usar authenticatedFetch do auth.js
          const response = await authenticatedFetch(url);

          if (response.ok) {
              const data = await response.json();
              this.renderNotifications(data.notifications || data);
              this.updatePagination(data.total || data.length);
          }
      } catch (error) {
          console.error('Erro ao carregar notificações:', error);
          this.showError('Erro ao carregar notificações');
      }
  }

  renderNotifications(notifications) {
      const container = document.getElementById('notificationsList');

      if (!notifications || notifications.length === 0) {
          container.innerHTML = `
              <div class="empty-state">
                  <i class="fas fa-bell-slash"></i>
                  <h3>Nenhuma notificação encontrada</h3>
                  <p>${this.searchTerm ? 'Tente ajustar os termos da busca.' : 'Comece criando sua primeira notificação.'}</p>
              </div>
          `;
          return;
      }

      container.innerHTML = notifications.map(notification => `
          <div class="notification-item-admin" data-id="${notification.id}">
              <div class="notification-header-admin">
                  <div style="flex: 1;">
                      <div class="notification-title-admin">${this.escapeHtml(notification.title)}</div>
                      <div class="notification-message-admin">${this.escapeHtml(notification.message)}</div>
                  </div>
                  <div class="notification-actions">
                      <button class="btn btn-small outline" onclick="adminNotifications.editNotification('${notification.id}')">
                          <i class="fas fa-edit"></i>
                      </button>
                      <button class="btn btn-small danger" onclick="adminNotifications.deleteNotification('${notification.id}')">
                          <i class="fas fa-trash"></i>
                      </button>
                  </div>
              </div>
              <div class="notification-meta-admin">
                  <div>
                      <span class="recipients-badge">
                          <i class="fas fa-users"></i>
                          ${notification.user_ids ? `${notification.user_ids.length} usuários` : 'Todos os usuários'}
                      </span>
                      <span style="margin-left: 1rem;">
                          <i class="fas fa-calendar"></i>
                          ${this.formatDate(notification.created_at)}
                      </span>
                  </div>
                  <div>
                      <span style="color: ${notification.is_read ? 'var(--success)' : 'var(--muted-dark)'};">
                          <i class="fas fa-eye"></i>
                          ${notification.is_read ? 'Lida' : 'Não lida'}
                      </span>
                  </div>
              </div>
          </div>
      `).join('');
  }

  async handleSubmit(e) {
      e.preventDefault();

      const title = document.getElementById('notificationTitle').value.trim();
      const message = document.getElementById('notificationMessage').value.trim();
      const recipientType = document.querySelector('input[name="recipientType"]:checked').value;

      if (!title || !message) {
          this.showError('Preencha todos os campos obrigatórios');
          return;
      }

      const submitButton = document.getElementById('submitButton');
      const originalText = submitButton.innerHTML;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
      submitButton.disabled = true;

      try {
          const notificationData = {
              title,
              message
          };

          if (recipientType === 'specific') {
              const selectedUsers = Array.from(document.querySelectorAll('#userSelection input:checked'))
                  .map(input => input.value)
                  .filter(id => id); // Remove valores vazios

              console.log('Usuários selecionados:', selectedUsers);

              if (selectedUsers.length === 0) {
                  this.showError('Selecione pelo menos um usuário');
                  return;
              }

              notificationData.user_ids = selectedUsers;
          }

          console.log('Enviando notificação:', notificationData);

          let response;
          if (this.editingId) {
              // Editar notificação existente
              response = await authenticatedFetch(`/api/admin/notifications/${this.editingId}`, {
                  method: 'PUT',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(notificationData)
              });
          } else {
              // Criar nova notificação
              response = await authenticatedFetch('/api/notifications', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(notificationData)
              });
          }

          const result = await response.json();
          console.log('Resposta do servidor:', result);

          if (response.ok) {
              this.showSuccess(
                  this.editingId ? 
                  'Notificação atualizada com sucesso!' : 
                  'Notificação enviada com sucesso!'
              );
              this.resetForm();
              this.loadNotifications();
              this.loadStats();

              // Atualizar notificações no header se existir
              if (window.notificationManager) {
                  window.notificationManager.loadNotifications();
              }
          } else {
              this.showError(result.detail || 'Erro ao enviar notificação');
          }
      } catch (error) {
          console.error('Erro ao enviar notificação:', error);
          this.showError('Erro de conexão ao enviar notificação');
      } finally {
          submitButton.innerHTML = originalText;
          submitButton.disabled = false;
      }
  }

  async editNotification(notificationId) {
      try {
          // Usar authenticatedFetch do auth.js
          const response = await authenticatedFetch(`/api/admin/notifications/${notificationId}`);

          if (response.ok) {
              const notification = await response.json();

              document.getElementById('editingNotificationId').value = notificationId;
              document.getElementById('notificationTitle').value = notification.title;
              document.getElementById('notificationMessage').value = notification.message;

              // Atualizar contadores
              this.updateCharCounter({ target: document.getElementById('notificationTitle') }, 'titleCounter', 255);
              this.updateCharCounter({ target: document.getElementById('notificationMessage') }, 'messageCounter', 1000);

              // Configurar tipo de destinatário
              if (notification.user_ids && notification.user_ids.length > 0) {
                  document.querySelector('input[name="recipientType"][value="specific"]').checked = true;
                  this.toggleRecipientType('specific');

                  // Selecionar usuários
                  notification.user_ids.forEach(userId => {
                      const checkbox = document.getElementById(`user-${userId}`);
                      if (checkbox) checkbox.checked = true;
                  });
              } else {
                  document.querySelector('input[name="recipientType"][value="all"]').checked = true;
                  this.toggleRecipientType('all');
              }

              // Atualizar UI para modo edição
              document.getElementById('formTitle').textContent = 'Editar Notificação';
              document.getElementById('submitButton').innerHTML = '<i class="fas fa-save"></i> Atualizar Notificação';
              document.getElementById('cancelEdit').style.display = 'inline-flex';

              this.editingId = notificationId;

              // Scroll para o formulário
              document.getElementById('notificationForm').scrollIntoView({ behavior: 'smooth' });
          }
      } catch (error) {
          console.error('Erro ao carregar notificação para edição:', error);
          this.showError('Erro ao carregar notificação');
      }
  }

  async deleteNotification(notificationId) {
      if (!confirm('Tem certeza que deseja excluir esta notificação?')) {
          return;
      }

      try {
          // Usar authenticatedFetch do auth.js
          const response = await authenticatedFetch(`/api/admin/notifications/${notificationId}`, {
              method: 'DELETE'
          });

          if (response.ok) {
              this.showSuccess('Notificação excluída com sucesso!');
              this.loadNotifications();
              this.loadStats();
          } else {
              const error = await response.json();
              this.showError(error.detail || 'Erro ao excluir notificação');
          }
      } catch (error) {
          console.error('Erro ao excluir notificação:', error);
          this.showError('Erro ao excluir notificação');
      }
  }

  cancelEdit() {
      this.resetForm();
  }

  resetForm() {
      document.getElementById('notificationForm').reset();
      document.getElementById('editingNotificationId').value = '';
      document.getElementById('formTitle').textContent = 'Nova Notificação';
      document.getElementById('submitButton').innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Notificação';
      document.getElementById('cancelEdit').style.display = 'none';
      document.querySelector('input[name="recipientType"][value="all"]').checked = true;
      this.toggleRecipientType('all');

      // Resetar contadores
      this.updateCharCounter({ target: document.getElementById('notificationTitle') }, 'titleCounter', 255);
      this.updateCharCounter({ target: document.getElementById('notificationMessage') }, 'messageCounter', 1000);

      this.editingId = null;
  }

  toggleRecipientType(type) {
      const container = document.getElementById('specificUsersContainer');
      container.style.display = type === 'specific' ? 'block' : 'none';
  }

  selectAllUsers() {
      document.querySelectorAll('#userSelection input[type="checkbox"]').forEach(checkbox => {
          checkbox.checked = true;
      });
  }

  deselectAllUsers() {
      document.querySelectorAll('#userSelection input[type="checkbox"]').forEach(checkbox => {
          checkbox.checked = false;
      });
  }

  handleSearch(e) {
      this.searchTerm = e.target.value;
      this.currentPage = 1;
      this.loadNotifications();
  }

  clearSearch() {
      document.getElementById('searchNotifications').value = '';
      this.searchTerm = '';
      this.currentPage = 1;
      this.loadNotifications();
  }

  previousPage() {
      if (this.currentPage > 1) {
          this.currentPage--;
          this.loadNotifications();
      }
  }

  nextPage() {
      if (this.currentPage < this.totalPages) {
          this.currentPage++;
          this.loadNotifications();
      }
  }

  updatePagination(totalItems) {
      this.totalPages = Math.ceil(totalItems / this.pageSize);

      document.getElementById('pageInfo').textContent = `Página ${this.currentPage} de ${this.totalPages}`;
      document.getElementById('prevPage').disabled = this.currentPage <= 1;
      document.getElementById('nextPage').disabled = this.currentPage >= this.totalPages;
  }

  updateCharCounter(e, counterId, maxLength) {
      const length = e.target.value.length;
      const counter = document.getElementById(counterId);
      counter.textContent = `${length}/${maxLength}`;

      counter.className = 'char-counter';
      if (length > maxLength * 0.8) {
          counter.classList.add('warning');
      }
      if (length > maxLength) {
          counter.classList.add('error');
      }
  }

  formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { 
          hour: '2-digit', 
          minute: '2-digit' 
      });
  }

  escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
  }

  showSuccess(message) {
      this.showMessage(message, 'success');
  }

  showError(message) {
      this.showMessage(message, 'error');
  }

  showMessage(message, type) {
      // Remove existing messages
      const existingMessage = document.querySelector('.notification-message');
      if (existingMessage) {
          existingMessage.remove();
      }

      const messageDiv = document.createElement('div');
      messageDiv.className = `notification-message ${type}`;
      messageDiv.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 1rem 1.5rem;
          border-radius: var(--radius);
          color: white;
          font-weight: 500;
          z-index: 10000;
          animation: slideIn 0.3s ease-out;
          max-width: 300px;
      `;

      if (type === 'success') {
          messageDiv.style.background = 'var(--success)';
      } else {
          messageDiv.style.background = 'var(--error)';
      }

      messageDiv.textContent = message;
      document.body.appendChild(messageDiv);

      setTimeout(() => {
          if (messageDiv.parentNode) {
              messageDiv.remove();
          }
      }, 5000);
  }
}

// Inicializar quando a página carregar
let adminNotifications;
document.addEventListener('DOMContentLoaded', async () => {
  // Aguardar a autenticação ser inicializada
  if (typeof initAuth === 'function') {
      await initAuth();
  }

  // Verificar se o usuário tem permissão
  if (typeof requireAuth === 'function') {
      if (!await requireAuth()) return;
  }

  // Verificar permissão específica para notificações
  if (typeof hasPermission === 'function') {
      const hasNotificationAccess = await hasPermission('notifications');
      if (!hasNotificationAccess) {
          alert('Você não tem permissão para acessar esta página.');
          window.location.href = '/search.html';
          return;
      }
  }

  adminNotifications = new AdminNotificationsManager();
});