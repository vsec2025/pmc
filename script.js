/*
 * Main client-side script for Project Management Console (PMC)
 *
 * This script initializes the Supabase client, handles authentication with Google,
 * retrieves and displays data from Supabase tables, and provides UI interactions
 * for managing projects, tasks and weekly reports. It is intentionally kept
 * modular with clearly labelled functions to ease maintenance and extension.
 */

// === Configuration ===
// Replace these values with your own Supabase URL and public anon key. Do NOT
// include any service role keys in client-side code. The anon key is safe to
// expose in a public client because row-level security policies will protect
// your data.

const SUPABASE_URL = 'https://hziwyxbwqcdittvlhijo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aXd5eGJ3cWNkaXR0dmxoaWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4ODE0MTksImV4cCI6MjA2OTQ1NzQxOX0.7kFGMEOX23Lg3b4imPalbju8G4yHyReuWBVoXVmvxEA';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
let currentUser = null;
let currentUserRole = null;
let usersCache = {};

// Document elements
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const projectsSection = document.getElementById('projects-section');
const tasksSection = document.getElementById('tasks-section');
const reportsSection = document.getElementById('reports-section');
const navItems = document.getElementById('nav-items');
const userInfo = document.getElementById('user-info');
const userNameEl = document.getElementById('user-name');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('login-error');
const signOutBtn = document.getElementById('signOutBtn');

// Modal references
const projectModal = new bootstrap.Modal(document.getElementById('projectModal'));
const taskModal = new bootstrap.Modal(document.getElementById('taskModal'));
const reportModal = new bootstrap.Modal(document.getElementById('reportModal'));

// When DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Setup event handlers
  loginBtn.addEventListener('click', handleLogin);
  signOutBtn.addEventListener('click', handleSignOut);
  document.querySelectorAll('a.nav-link').forEach(link => {
    link.addEventListener('click', handleSectionChange);
  });
  document.getElementById('createProjectBtn').addEventListener('click', openNewProjectModal);
  document.getElementById('saveProjectBtn').addEventListener('click', saveProject);
  document.getElementById('projectFilter').addEventListener('change', fetchProjects);
  document.getElementById('createTaskBtn').addEventListener('click', openNewTaskModal);
  document.getElementById('saveTaskBtn').addEventListener('click', saveTask);
  document.getElementById('taskFilter').addEventListener('change', fetchTasks);
  document.getElementById('createReportBtn').addEventListener('click', openNewReportModal);
  document.getElementById('saveReportBtn').addEventListener('click', saveReport);
  document.getElementById('exportCsvBtn').addEventListener('click', exportReportsCsv);
  document.getElementById('exportPdfBtn').addEventListener('click', exportReportsPdf);
  // Monitor auth state changes
  initAuthState();
});

/**
 * Initialize authentication state: check if the user is already logged in when
 * the page loads, handle changes to the auth state, and verify whether the
 * logged-in user is authorised (exists in the "users" table).
 */
async function initAuthState() {
  // On page load, check session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await handleUserLoggedIn(session.user);
  } else {
    showLogin();
  }
  // Listen to auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      await handleUserLoggedIn(session.user);
    } else {
      handleUserLoggedOut();
    }
  });
}

/**
 * Trigger Google sign-in via Supabase OAuth provider. Users will be redirected
 * to Google's login page and back to the current page. The redirectTo must
 * match a domain configured in Supabase OAuth settings.
 */
function handleLogin() {
  // Clear any error
  loginError.classList.add('d-none');
  loginError.innerText = '';
  // Start OAuth login
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });
}

/**
 * Handle sign out by clearing session via Supabase. UI will update via
 * auth state listener.
 */
async function handleSignOut() {
  await supabase.auth.signOut();
}

/**
 * Called when a user successfully logs in. Verifies that the user's email
 * exists in the 'users' table; if not, denies access and signs them out.
 * Otherwise, caches their info and loads application data.
 * @param {object} supaUser Supabase user object
 */
async function handleUserLoggedIn(supaUser) {
  currentUser = supaUser;
  // Query users table for email
  const { data, error } = await supabase
    .from('users')
    .select('user_id, full_name, role')
    .eq('email', supaUser.email)
    .maybeSingle();
  if (error) {
    console.error('Error fetching user:', error);
    loginError.innerText = 'Lỗi khi kiểm tra người dùng. Vui lòng thử lại.';
    loginError.classList.remove('d-none');
    return;
  }
  if (!data) {
    // User not authorised
    loginError.innerText = 'Tài khoản không được cấp quyền truy cập.';
    loginError.classList.remove('d-none');
    await supabase.auth.signOut();
    return;
  }
  // Authorised user
  currentUserRole = data.role;
  // Show nav and user info
  userNameEl.textContent = data.full_name || supaUser.email;
  userInfo.style.display = 'flex';
  navItems.style.display = 'flex';
  // Adjust nav items for role
  if (currentUserRole !== 'admin') {
    // Hide project management for non-admin
    document.querySelector('a.nav-link[href="#projects-section"]').parentElement.style.display = 'none';
    document.getElementById('createProjectBtn').style.display = 'none';
    document.getElementById('createTaskBtn').style.display = 'none';
    document.getElementById('exportButtons').classList.add('d-none');
  }
  // Preload users cache
  await preloadUsers();
  // Navigate to dashboard
  showSection('dashboard-section');
  fetchDashboard();
}

/**
 * Called when a user logs out. Resets the UI and shows the login screen.
 */
function handleUserLoggedOut() {
  currentUser = null;
  currentUserRole = null;
  usersCache = {};
  userInfo.style.display = 'none';
  navItems.style.display = 'none';
  showLogin();
}

/**
 * Show the login section and hide all other sections. Used when no user is
 * signed in or when access is denied.
 */
function showLogin() {
  loginSection.style.display = 'block';
  dashboardSection.style.display = 'none';
  projectsSection.style.display = 'none';
  tasksSection.style.display = 'none';
  reportsSection.style.display = 'none';
}

/**
 * Event handler for switching between sections when clicking nav links.
 */
function handleSectionChange(event) {
  event.preventDefault();
  const target = event.currentTarget.getAttribute('data-section');
  showSection(target);
  // Load data for the selected section
  if (target === 'dashboard-section') fetchDashboard();
  if (target === 'projects-section') fetchProjects();
  if (target === 'tasks-section') fetchTasks();
  if (target === 'reports-section') fetchReports();
}

/**
 * Show one section by id and hide the others. Highlights the active nav link.
 * @param {string} sectionId ID of the section to show
 */
function showSection(sectionId) {
  [dashboardSection, projectsSection, tasksSection, reportsSection].forEach(sec => {
    sec.style.display = sec.id === sectionId ? 'block' : 'none';
  });
  document.querySelectorAll('a.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-section') === sectionId);
  });
}

/**
 * Preload all users into a cache for quick lookups (e.g. mapping user_id to full_name).
 */
async function preloadUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, full_name');
  if (error) {
    console.error('Error loading users:', error);
    return;
  }
  usersCache = {};
  data.forEach(u => {
    usersCache[u.user_id] = u.full_name;
  });
}

// =====================================
// Dashboard functions
// =====================================

/**
 * Fetch data for dashboard summary and render cards and today's tasks.
 */
async function fetchDashboard() {
  // Fetch projects and tasks concurrently
  const [projectsRes, tasksRes] = await Promise.all([
    supabase.from('projects').select('status, progress'),
    supabase.from('tasks').select('status, due_date, assignee, project_id, task_name')
  ]);
  if (projectsRes.error) {
    console.error('Error fetching projects:', projectsRes.error);
    return;
  }
  if (tasksRes.error) {
    console.error('Error fetching tasks:', tasksRes.error);
    return;
  }
  const projects = projectsRes.data;
  const tasks = tasksRes.data;
  // Compute statistics
  const totalProjects = projects.length;
  const totalActiveProjects = projects.filter(p => p.status !== 'da hoan thanh').length;
  const totalOpenTasks = tasks.filter(t => t.status !== 'hoan thanh').length;
  const avgProgress = totalProjects > 0 ? (projects.reduce((sum, p) => sum + (p.progress || 0), 0) / totalProjects).toFixed(1) : '0';
  // Render cards
  const dashboardCards = document.getElementById('dashboard-cards');
  dashboardCards.innerHTML = '';
  const cardData = [
    { title: 'Tổng số dự án', value: totalProjects },
    { title: 'Dự án đang chạy', value: totalActiveProjects },
    { title: 'Công việc đang mở', value: totalOpenTasks },
    { title: 'Tiến độ trung bình (%)', value: avgProgress }
  ];
  cardData.forEach(item => {
    const col = document.createElement('div');
    col.className = 'col-md-3 mb-3';
    col.innerHTML = `
      <div class="card dashboard-card">
        <div class="card-body">
          <h5 class="card-title">${item.title}</h5>
          <p class="card-text">${item.value}</p>
        </div>
      </div>`;
    dashboardCards.appendChild(col);
  });
  // Render today's tasks list
  const today = new Date().toISOString().split('T')[0];
  let todayTasks = tasks.filter(t => t.due_date === today);
  if (currentUserRole !== 'admin') {
    todayTasks = todayTasks.filter(t => t.assignee === currentUser.id);
  }
  const grouped = {};
  todayTasks.forEach(t => {
    if (!grouped[t.assignee]) grouped[t.assignee] = [];
    grouped[t.assignee].push(t);
  });
  const tasksContainer = document.getElementById('dashboard-today-tasks');
  tasksContainer.innerHTML = '';
  if (todayTasks.length === 0) {
    tasksContainer.innerHTML = '<p>Không có công việc nào hết hạn hôm nay.</p>';
  } else {
    Object.keys(grouped).forEach(assigneeId => {
      const userName = usersCache[assigneeId] || assigneeId;
      const col = document.createElement('div');
      col.className = 'col-md-6 mb-3';
      let listItems = '';
      grouped[assigneeId].forEach(t => {
        listItems += `<li>${t.task_name} (Dự án ${t.project_id})</li>`;
      });
      col.innerHTML = `
        <div class="card h-100">
          <div class="card-header bg-primary text-white">${userName}</div>
          <ul class="list-group list-group-flush">
            ${listItems}
          </ul>
        </div>`;
      tasksContainer.appendChild(col);
    });
  }
}

// =====================================
// Projects functions
// =====================================

/**
 * Fetch projects from Supabase, apply filter, and render the project table.
 */
async function fetchProjects() {
  const statusFilter = document.getElementById('projectFilter').value;
  let query = supabase.from('projects').select('*');
  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }
  const { data, error } = await query.order('project_id', { ascending: true });
  if (error) {
    console.error('Error fetching projects:', error);
    return;
  }
  renderProjectsTable(data || []);
}

/**
 * Render the projects into the projectsTable body. Also attach click
 * handlers to each row for editing (admin only).
 * @param {Array} projects List of project records
 */
function renderProjectsTable(projects) {
  const tbody = document.querySelector('#projectsTable tbody');
  tbody.innerHTML = '';
  projects.forEach(project => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${project.project_id}</td>
      <td>${project.project_name || ''}</td>
      <td>${project.client_name || ''}</td>
      <td>${project.start_date || ''}</td>
      <td>${project.end_date || ''}</td>
      <td>${project.status || ''}</td>
      <td>${project.progress != null ? project.progress : ''}</td>
    `;
    if (currentUserRole === 'admin') {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => openEditProjectModal(project));
    }
    tbody.appendChild(tr);
  });
}

/**
 * Show modal for creating a new project. Clears any existing values.
 */
async function openNewProjectModal() {
  // Reset form
  document.getElementById('projectForm').reset();
  document.getElementById('projectIdInput').value = '';
  document.getElementById('projectModalLabel').innerText = 'Tạo Dự án';
  projectModal.show();
}

/**
 * Show modal for editing an existing project. Fills the form with project data.
 * @param {object} project Project record to edit
 */
function openEditProjectModal(project) {
  document.getElementById('projectForm').reset();
  document.getElementById('projectIdInput').value = project.project_id;
  document.getElementById('projectNameInput').value = project.project_name || '';
  document.getElementById('clientNameInput').value = project.client_name || '';
  document.getElementById('startDateInput').value = project.start_date || '';
  document.getElementById('endDateInput').value = project.end_date || '';
  document.getElementById('projectStatusInput').value = project.status || 'dang thuc hien';
  document.getElementById('projectProgressInput').value = project.progress || 0;
  document.getElementById('projectModalLabel').innerText = `Cập nhật Dự án ${project.project_id}`;
  projectModal.show();
}

/**
 * Save (insert or update) project when clicking Save button in modal.
 */
async function saveProject() {
  const id = document.getElementById('projectIdInput').value.trim();
  const name = document.getElementById('projectNameInput').value.trim();
  const client = document.getElementById('clientNameInput').value.trim();
  const startDate = document.getElementById('startDateInput').value || null;
  const endDate = document.getElementById('endDateInput').value || null;
  const status = document.getElementById('projectStatusInput').value;
  const progress = parseFloat(document.getElementById('projectProgressInput').value) || 0;
  if (!name) {
    alert('Vui lòng nhập tên dự án.');
    return;
  }
  try {
    if (id) {
      // Update existing project
      const { error } = await supabase.from('projects').update({
        project_name: name,
        client_name: client,
        start_date: startDate,
        end_date: endDate,
        status,
        progress
      }).eq('project_id', id);
      if (error) throw error;
    } else {
      // Create new project
      const newId = await generateProjectId();
      const { error } = await supabase.from('projects').insert([
        {
          project_id: newId,
          project_name: name,
          client_name: client,
          start_date: startDate,
          end_date: endDate,
          status,
          progress
        }
      ]);
      if (error) throw error;
    }
    projectModal.hide();
    fetchProjects();
    fetchDashboard();
  } catch (err) {
    console.error('Error saving project:', err);
    alert('Lỗi khi lưu dự án.');
  }
}

/**
 * Generate a new project ID following the pattern PYY###, where YY is the last
 * two digits of the current year and ### is an incrementing three-digit
 * number starting at 001.
 * @returns {Promise<string>} New unique project ID
 */
async function generateProjectId() {
  const prefix = 'P' + new Date().getFullYear().toString().slice(-2);
  const { data, error } = await supabase
    .from('projects')
    .select('project_id')
    .ilike('project_id', `${prefix}%`)
    .order('project_id', { ascending: false })
    .limit(1);
  if (error) {
    console.error('Error generating project ID:', error);
    return prefix + '001';
  }
  if (data && data.length > 0) {
    const last = data[0].project_id;
    const numStr = last.slice(prefix.length);
    const num = parseInt(numStr, 10) || 0;
    const newNum = num + 1;
    return prefix + newNum.toString().padStart(3, '0');
  }
  return prefix + '001';
}

// =====================================
// Tasks functions
// =====================================

/**
 * Fetch tasks from Supabase, apply status filter and user visibility, then
 * render the tasks table.
 */
async function fetchTasks() {
  const statusFilter = document.getElementById('taskFilter').value;
  let query = supabase.from('tasks').select('*');
  // Non-admins only see their tasks
  if (currentUserRole !== 'admin') {
    query = query.eq('assignee', currentUser.id);
  }
  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }
  const { data, error } = await query.order('task_id', { ascending: true });
  if (error) {
    console.error('Error fetching tasks:', error);
    return;
  }
  renderTasksTable(data || []);
}

/**
 * Render the tasks into the tasksTable body. Attach click handler for
 * editing tasks (admin and assignee only).
 * @param {Array} tasks List of task records
 */
function renderTasksTable(tasks) {
  const tbody = document.querySelector('#tasksTable tbody');
  tbody.innerHTML = '';
  tasks.forEach(task => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${task.task_id}</td>
      <td>${task.project_id}</td>
      <td>${task.task_name || ''}</td>
      <td>${usersCache[task.assignee] || task.assignee}</td>
      <td>${task.due_date || ''}</td>
      <td>${task.status || ''}</td>
      <td>${task.progress != null ? task.progress : ''}</td>
    `;
    // Determine if user can edit: admin or assignee
    const canEdit = currentUserRole === 'admin' || task.assignee === currentUser.id;
    if (canEdit) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => openEditTaskModal(task));
    }
    tbody.appendChild(tr);
  });
}

/**
 * Show modal for creating a new task. Loads project and user options.
 */
async function openNewTaskModal() {
  document.getElementById('taskForm').reset();
  document.getElementById('taskIdInput').value = '';
  document.getElementById('taskModalLabel').innerText = 'Tạo Công việc';
  await loadProjectOptions();
  await loadUserOptions();
  taskModal.show();
}

/**
 * Show modal for editing an existing task. Prefills form and loads
 * project/user options.
 * @param {object} task Task record
 */
async function openEditTaskModal(task) {
  document.getElementById('taskForm').reset();
  document.getElementById('taskIdInput').value = task.task_id;
  document.getElementById('taskNameInput').value = task.task_name || '';
  document.getElementById('taskDueDateInput').value = task.due_date || '';
  document.getElementById('taskStatusInput').value = task.status || 'chua lam';
  document.getElementById('taskProgressInput').value = task.progress || 0;
  document.getElementById('taskNoteInput').value = task.note || '';
  await loadProjectOptions(task.project_id);
  await loadUserOptions(task.assignee);
  document.getElementById('taskModalLabel').innerText = `Cập nhật Công việc ${task.task_id}`;
  taskModal.show();
}

/**
 * Load project options into the select element in the task modal.
 * @param {string|null} selectedId Optional ID to preselect
 */
async function loadProjectOptions(selectedId = null) {
  const select = document.getElementById('taskProjectSelect');
  select.innerHTML = '';
  const { data, error } = await supabase.from('projects').select('project_id, project_name');
  if (error) {
    console.error('Error loading projects:', error);
    return;
  }
  data.forEach(p => {
    const option = document.createElement('option');
    option.value = p.project_id;
    option.textContent = `${p.project_id} - ${p.project_name}`;
    if (selectedId && p.project_id === selectedId) option.selected = true;
    select.appendChild(option);
  });
}

/**
 * Load user options into the select element in the task modal. Only admin can
 * assign tasks to any user. Non-admin only assign tasks to themselves.
 * @param {string|null} selectedId Optional ID to preselect
 */
async function loadUserOptions(selectedId = null) {
  const select = document.getElementById('taskAssigneeSelect');
  select.innerHTML = '';
  if (currentUserRole === 'admin') {
    const { data, error } = await supabase.from('users').select('user_id, full_name');
    if (error) {
      console.error('Error loading users:', error);
      return;
    }
    data.forEach(u => {
      const option = document.createElement('option');
      option.value = u.user_id;
      option.textContent = u.full_name;
      if (selectedId && u.user_id === selectedId) option.selected = true;
      select.appendChild(option);
    });
  } else {
    // Only self
    const option = document.createElement('option');
    option.value = currentUser.id;
    option.textContent = usersCache[currentUser.id] || currentUser.email;
    option.selected = true;
    select.appendChild(option);
  }
}

/**
 * Save (insert or update) a task when clicking Save button in modal.
 */
async function saveTask() {
  const id = document.getElementById('taskIdInput').value.trim();
  const projectId = document.getElementById('taskProjectSelect').value;
  const name = document.getElementById('taskNameInput').value.trim();
  const assignee = document.getElementById('taskAssigneeSelect').value;
  const dueDate = document.getElementById('taskDueDateInput').value;
  const status = document.getElementById('taskStatusInput').value;
  const progress = parseFloat(document.getElementById('taskProgressInput').value) || 0;
  const note = document.getElementById('taskNoteInput').value.trim() || null;
  if (!name) {
    alert('Vui lòng nhập tên công việc.');
    return;
  }
  try {
    if (id) {
      // Update existing task
      const { error } = await supabase.from('tasks').update({
        project_id: projectId,
        task_name: name,
        assignee,
        due_date: dueDate,
        status,
        progress,
        note
      }).eq('task_id', id);
      if (error) throw error;
    } else {
      // Create new task
      const newId = await generateTaskId();
      const { error } = await supabase.from('tasks').insert([
        {
          task_id: newId,
          project_id: projectId,
          task_name: name,
          assignee,
          due_date: dueDate,
          status,
          progress,
          note
        }
      ]);
      if (error) throw error;
    }
    taskModal.hide();
    fetchTasks();
    fetchDashboard();
  } catch (err) {
    console.error('Error saving task:', err);
    alert('Lỗi khi lưu công việc.');
  }
}

/**
 * Generate a new task ID following the pattern TYY###.
 * @returns {Promise<string>} New unique task ID
 */
async function generateTaskId() {
  const prefix = 'T' + new Date().getFullYear().toString().slice(-2);
  const { data, error } = await supabase
    .from('tasks')
    .select('task_id')
    .ilike('task_id', `${prefix}%`)
    .order('task_id', { ascending: false })
    .limit(1);
  if (error) {
    console.error('Error generating task ID:', error);
    return prefix + '001';
  }
  if (data && data.length > 0) {
    const last = data[0].task_id;
    const numStr = last.slice(prefix.length);
    const num = parseInt(numStr, 10) || 0;
    const newNum = num + 1;
    return prefix + newNum.toString().padStart(3, '0');
  }
  return prefix + '001';
}

// =====================================
// Weekly Reports functions
// =====================================

/**
 * Fetch weekly reports from Supabase. Admin sees all; users see their own.
 */
async function fetchReports() {
  let query = supabase.from('weekly_reports').select('*, user_id');
  if (currentUserRole !== 'admin') {
    query = query.eq('user_id', currentUser.id);
  }
  const { data, error } = await query.order('year', { ascending: false }).order('week_number', { ascending: false });
  if (error) {
    console.error('Error fetching reports:', error);
    return;
  }
  renderReportsTable(data || []);
  // Show export buttons for admin if there are reports
  if (currentUserRole === 'admin' && data && data.length > 0) {
    document.getElementById('exportButtons').classList.remove('d-none');
  }
}

/**
 * Render weekly reports into the reportsTable body.
 * @param {Array} reports List of report records
 */
function renderReportsTable(reports) {
  const tbody = document.querySelector('#reportsTable tbody');
  tbody.innerHTML = '';
  reports.forEach(report => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${usersCache[report.user_id] || report.user_id}</td>
      <td>${report.week_number}</td>
      <td>${report.year}</td>
      <td>${report.summary || ''}</td>
    `;
    tbody.appendChild(tr);
  });
  // Store for export
  window.currentReports = reports;
}

/**
 * Show modal for creating a new weekly report.
 */
function openNewReportModal() {
  document.getElementById('reportForm').reset();
  // Pre-fill current week number and year
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((now - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
  document.getElementById('weekNumberInput').value = weekNumber;
  document.getElementById('reportYearInput').value = now.getFullYear();
  reportModal.show();
}

/**
 * Save weekly report by inserting into Supabase.
 */
async function saveReport() {
  const week = parseInt(document.getElementById('weekNumberInput').value);
  const year = parseInt(document.getElementById('reportYearInput').value);
  const summary = document.getElementById('reportSummaryInput').value.trim();
  if (!summary) {
    alert('Vui lòng nhập nội dung báo cáo.');
    return;
  }
  try {
    const { error } = await supabase.from('weekly_reports').insert([
      {
        user_id: currentUser.id,
        week_number: week,
        year,
        summary
      }
    ]);
    if (error) throw error;
    reportModal.hide();
    fetchReports();
  } catch (err) {
    console.error('Error saving report:', err);
    alert('Lỗi khi gửi báo cáo.');
  }
}

/**
 * Export current reports (admin) to a CSV file and trigger download.
 */
function exportReportsCsv() {
  const reports = window.currentReports || [];
  if (reports.length === 0) return;
  let csv = 'Người báo cáo,Tuần,Năm,Nội dung\n';
  reports.forEach(r => {
    const row = [
      (usersCache[r.user_id] || r.user_id).replace(/,/g, ' '),
      r.week_number,
      r.year,
      '"' + (r.summary || '').replace(/"/g, '""') + '"'
    ];
    csv += row.join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'weekly_reports.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export current reports (admin) to a PDF file using jsPDF.
 */
function exportReportsPdf() {
  const reports = window.currentReports || [];
  if (reports.length === 0) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Báo cáo Tuần', 14, 20);
  doc.setFontSize(10);
  const tableColumn = ['Người báo cáo', 'Tuần', 'Năm', 'Nội dung'];
  const tableRows = [];
  reports.forEach(r => {
    tableRows.push([
      usersCache[r.user_id] || r.user_id,
      r.week_number,
      r.year,
      r.summary || ''
    ]);
  });
  // Simple table rendering: iterate rows and draw text with spacing
  let startY = 30;
  doc.setFont(undefined, 'bold');
  tableColumn.forEach((col, index) => {
    doc.text(col, 14 + index * 45, startY);
  });
  doc.setFont(undefined, 'normal');
  startY += 6;
  tableRows.forEach(row => {
    row.forEach((cell, idx) => {
      const text = String(cell);
      const xPos = 14 + idx * 45;
      const lines = doc.splitTextToSize(text, 40);
      doc.text(lines, xPos, startY);
    });
    startY += 6;
    // Add new page if necessary
    if (startY > 280) {
      doc.addPage();
      startY = 20;
    }
  });
  doc.save('weekly_reports.pdf');
}
