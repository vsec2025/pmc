
/*
 * Main client-side script for Project Management Console (PMC)
 *
 * Enhanced version with project-based weekly reports, optional daily reports,
 * and data aggregation features for employee and project analysis.
 */

// === Configuration ===
const SUPABASE_URL = 'https://hziwyxbwqcdittvlhijo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aXd5eGJ3cWNkaXR0dmxoaWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4ODE0MTksImV4cCI6MjA2OTQ1NzQxOX0.7kFGMEOX23Lg3b4imPalbju8G4yHyReuWBVoXVmvxEA';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
const dailyReportModal = new bootstrap.Modal(document.getElementById('dailyReportModal'));

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
  document.getElementById('createDailyReportBtn').addEventListener('click', openNewDailyReportModal);
  document.getElementById('saveReportBtn').addEventListener('click', saveReport);
  document.getElementById('saveDailyReportBtn').addEventListener('click', saveDailyReport);
  document.getElementById('exportCsvBtn').addEventListener('click', exportReportsCsv);
  document.getElementById('exportPdfBtn').addEventListener('click', exportReportsPdf);
  document.getElementById('employeeSummaryBtn').addEventListener('click', showEmployeeSummary);
  document.getElementById('projectSummaryBtn').addEventListener('click', showProjectSummary);
  // Monitor auth state changes
  initAuthState();
});

// === Authentication Functions ===
async function initAuthState() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await handleUserLoggedIn(session.user);
  } else {
    showLogin();
  }
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      await handleUserLoggedIn(session.user);
    } else {
      handleUserLoggedOut();
    }
  });
}

function handleLogin() {
  loginError.classList.add('d-none');
  loginError.innerText = '';
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });
}

async function handleSignOut() {
  await supabase.auth.signOut();
}

async function handleUserLoggedIn(supaUser) {
  currentUser = supaUser;
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
    loginError.innerText = 'Tài khoản không được cấp quyền truy cập.';
    loginError.classList.remove('d-none');
    await supabase.auth.signOut();
    return;
  }
  currentUserRole = data.role;
  userNameEl.textContent = data.full_name || supaUser.email;
  userInfo.style.display = 'flex';
  navItems.style.display = 'flex';
  if (currentUserRole !== 'admin') {
    document.querySelector('a.nav-link[href="#projects-section"]').parentElement.style.display = 'none';
    document.getElementById('createProjectBtn').style.display = 'none';
    document.getElementById('createTaskBtn').style.display = 'none';
    document.getElementById('exportButtons').classList.add('d-none');
    document.getElementById('analysisButtons').classList.add('d-none');
  }
  await preloadUsers();
  showSection('dashboard-section');
  fetchDashboard();
}

function handleUserLoggedOut() {
  currentUser = null;
  currentUserRole = null;
  usersCache = {};
  userInfo.style.display = 'none';
  navItems.style.display = 'none';
  showLogin();
}

function showLogin() {
  loginSection.style.display = 'block';
  dashboardSection.style.display = 'none';
  projectsSection.style.display = 'none';
  tasksSection.style.display = 'none';
  reportsSection.style.display = 'none';
}

function handleSectionChange(event) {
  event.preventDefault();
  const target = event.currentTarget.getAttribute('data-section');
  showSection(target);
  if (target === 'dashboard-section') fetchDashboard();
  if (target === 'projects-section') fetchProjects();
  if (target === 'tasks-section') fetchTasks();
  if (target === 'reports-section') fetchReports();
}

function showSection(sectionId) {
  [dashboardSection, projectsSection, tasksSection, reportsSection].forEach(sec => {
    sec.style.display = sec.id === sectionId ? 'block' : 'none';
  });
  document.querySelectorAll('a.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-section') === sectionId);
  });
}

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

// === Dashboard Functions ===
async function fetchDashboard() {
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
  const totalProjects = projects.length;
  const totalActiveProjects = projects.filter(p => p.status !== 'da hoan thanh').length;
  const totalOpenTasks = tasks.filter(t => t.status !== 'hoan thanh').length;
  const avgProgress = totalProjects > 0 ? (projects.reduce((sum, p) => sum + (p.progress || 0), 0) / totalProjects).toFixed(1) : '0';
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

// === Projects Functions ===
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

async function openNewProjectModal() {
  document.getElementById('projectForm').reset();
  document.getElementById('projectIdInput').value = '';
  document.getElementById('projectModalLabel').innerText = 'Tạo Dự án';
  projectModal.show();
}

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

// === Tasks Functions ===
async function fetchTasks() {
  const statusFilter = document.getElementById('taskFilter').value;
  let query = supabase.from('tasks').select('*, hours_worked');
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
      <td>${task.hours_worked != null ? task.hours_worked : ''}</td>
    `;
    const canEdit = currentUserRole === 'admin' || task.assignee === currentUser.id;
    if (canEdit) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => openEditTaskModal(task));
    }
    tbody.appendChild(tr);
  });
}

async function openNewTaskModal() {
  document.getElementById('taskForm').reset();
  document.getElementById('taskIdInput').value = '';
  document.getElementById('taskModalLabel').innerText = 'Tạo Công việc';
  await loadProjectOptions();
  await loadUserOptions();
  taskModal.show();
}

async function openEditTaskModal(task) {
  document.getElementById('taskForm').reset();
  document.getElementById('taskIdInput').value = task.task_id;
  document.getElementById('taskNameInput').value = task.task_name || '';
  document.getElementById('taskDueDateInput').value = task.due_date || '';
  document.getElementById('taskStatusInput').value = task.status || 'chua lam';
  document.getElementById('taskProgressInput').value = task.progress || 0;
  document.getElementById('taskNoteInput').value = task.note || '';
  document.getElementById('taskHoursWorkedInput').value = task.hours_worked || 0;
  await loadProjectOptions(task.project_id);
  await loadUserOptions(task.assignee);
  document.getElementById('taskModalLabel').innerText = `Cập nhật Công việc ${task.task_id}`;
  taskModal.show();
}

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
    const option = document.createElement('option');
    option.value = currentUser.id;
    option.textContent = usersCache[currentUser.id] || currentUser.email;
    option.selected = true;
    select.appendChild(option);
  }
}

async function saveTask() {
  const id = document.getElementById('taskIdInput').value.trim();
  const projectId = document.getElementById('taskProjectSelect').value;
  const name = document.getElementById('taskNameInput').value.trim();
  const assignee = document.getElementById('taskAssigneeSelect').value;
  const dueDate = document.getElementById('taskDueDateInput').value;
  const status = document.getElementById('taskStatusInput').value;
  const progress = parseFloat(document.getElementById('taskProgressInput').value) || 0;
  const note = document.getElementById('taskNoteInput').value.trim() || null;
  const hoursWorked = parseFloat(document.getElementById('taskHoursWorkedInput').value) || 0;
  if (!name) {
    alert('Vui lòng nhập tên công việc.');
    return;
  }
  try {
    if (id) {
      const { error } = await supabase.from('tasks').update({
        project_id: projectId,
        task_name: name,
        assignee,
        due_date: dueDate,
        status,
        progress,
        note,
        hours_worked: hoursWorked
      }).eq('task_id', id);
      if (error) throw error;
    } else {
      const newiD = await generateTaskId();
      const { error } = await supabase.from('tasks').insert([
        {
          task_id: newId,
          project_id: projectId,
          task_name: name,
          assignee,
          due_date: dueDate,
          status,
          progress,
          note,
          hours_worked: hoursWorked
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

// === Weekly Reports Functions ===
async function fetchReports() {
  let query = supabase.from('weekly_reports').select('*, projects(project_id, project_name)');
  if (currentUserRole !== 'admin') {
    query = query.eq('user_id', currentUser.id);
  }
  const { data, error } = await query.order('year', { ascending: false }).order('week_number', { ascending: false });
  if (error) {
    console.error('Error fetching reports:', error);
    return;
  }
  renderReportsTable(data || []);
  if (currentUserRole === 'admin' && data && data.length > 0) {
    document.getElementById('exportButtons').classList.remove('d-none');
    document.getElementById('analysisButtons').classList.remove('d-none');
  }
  window.currentReports = data;
}

function renderReportsTable(reports) {
  const tbody = document.querySelector('#reportsTable tbody');
  tbody.innerHTML = '';
  reports.forEach(report => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${usersCache[report.user_id] || report.user_id}</td>
      <td>${report.week_number}</td>
      <td>${report.year}</td>
      <td>${report.projects.project_name} (${report.projects.project_id})</td>
      <td>${report.tasks_completed || ''}</td>
      <td>${report.next_week_plan || ''}</td>
      <td>${report.hours_worked != null ? report.hours_worked : ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function openNewReportModal() {
  document.getElementById('reportForm').reset();
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((now - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
  document.getElementById('weekNumberInput').value = weekNumber;
  document.getElementById('reportYearInput').value = now.getFullYear();
  await loadReportProjectOptions();
  reportModal.show();
}

async function loadReportProjectOptions(selectedId = null) {
  const select = document.getElementById('reportProjectSelect');
  select.innerHTML = '';
  let query = supabase.from('projects').select('project_id, project_name');
  if (currentUserRole !== 'admin') {
    query = query.in('project_id', await getUserProjectIds());
  }
  const { data, error } = await query;
  if (error) {
    console.error('Error loading projects for report:', error);
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

async function getUserProjectIds() {
  const { data, error } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('assignee', currentUser.id)
    .neq('status', 'hoan thanh');
  if (error) {
    console.error('Error fetching user projects:', error);
    return [];
  }
  return [...new Set(data.map(t => t.project_id))];
}

async function saveReport() {
  const projectId = document.getElementById('reportProjectSelect').value;
  const week = parseInt(document.getElementById('weekNumberInput').value);
  const year = parseInt(document.getElementById('reportYearInput').value);
  const tasksCompleted = document.getElementById('tasksCompletedInput').value.trim();
  const nextWeekPlan = document.getElementById('nextWeekPlanInput').value.trim();
  const hoursWorked = parseFloat(document.getElementById('reportHoursWorkedInput').value) || 0;
  if (!projectId || !tasksCompleted || !nextWeekPlan) {
    alert('Vui lòng điền đầy đủ thông tin báo cáo.');
    return;
  }
  try {
    const { error } = await supabase.from('weekly_reports').insert([
      {
        user_id: currentUser.id,
        project_id: projectId,
        week_number: week,
        year,
        tasks_completed: tasksCompleted,
        next_week_plan: nextWeekPlan,
        hours_worked: hoursWorked
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

// === Daily Reports Functions ===
async function openNewDailyReportModal() {
  document.getElementById('dailyReportForm').reset();
  document.getElementById('dailyReportDateInput').value = new Date().toISOString().split('T')[0];
  await loadReportProjectOptions();
  dailyReportModal.show();
}

async function saveDailyReport() {
  const projectId = document.getElementById('dailyReportProjectSelect').value;
  const date = document.getElementById('dailyReportDateInput').value;
  const tasksCompleted = document.getElementById('dailyTasksCompletedInput').value.trim();
  const hoursWorked = parseFloat(document.getElementById('dailyReportHoursWorkedInput').value) || 0;
  if (!projectId || !tasksCompleted) {
    alert('Vui lòng điền đầy đủ thông tin báo cáo ngày.');
    return;
  }
  try {
    const { error } = await supabase.from('daily_reports').insert([
      {
        user_id: currentUser.id,
        project_id: projectId,
        report_date: date,
        tasks_completed: tasksCompleted,
        hours_worked: hoursWorked
      }
    ]);
    if (error) throw error;
    dailyReportModal.hide();
    fetchReports();
  } catch (err) {
    console.error('Error saving daily report:', err);
    alert('Lỗi khi gửi báo cáo ngày.');
  }
}

// === Analysis Functions ===
async function showEmployeeSummary() {
  const userId = prompt('Nhập ID người dùng để xem tổng hợp:');
  if (!userId || !usersCache[userId]) {
    alert('ID người dùng không hợp lệ.');
    return;
  }
  const startDate = prompt('Nhập ngày bắt đầu (YYYY-MM-DD):');
  const endDate = prompt('Nhập ngày kết thúc (YYYY-MM-DD):');
  if (!startDate || !endDate) {
    alert('Vui lòng nhập khoảng thời gian hợp lệ.');
    return;
  }
  const [weeklyReports, dailyReports, tasks] = await Promise.all([
    supabase.from('weekly_reports').select('*, projects(project_id, project_name)').gte('year', startDate.slice(0, 4)).lte('year', endDate.slice(0, 4)).eq('user_id', userId),
    supabase.from('daily_reports').select('*, projects(project_id, project_name)').gte('report_date', startDate).lte('report_date', endDate).eq('user_id', userId),
    supabase.from('tasks').select('*, projects(project_id, project_name)').gte('due_date', startDate).lte('due_date', endDate).eq('assignee', userId)
  ]);
  if (weeklyReports.error || dailyReports.error || tasks.error) {
    console.error('Error fetching employee summary:', weeklyReports.error || dailyReports.error || tasks.error);
    alert('Lỗi khi lấy dữ liệu tổng hợp.');
    return;
  }
  const totalHours = [
    ...weeklyReports.data.map(r => r.hours_worked || 0),
    ...dailyReports.data.map(r => r.hours_worked || 0)
  ].reduce((sum, h) => sum + h, 0);
  const report = `
Tổng hợp cho ${usersCache[userId]} từ ${startDate} đến ${endDate}:
- Tổng số giờ làm việc: ${totalHours}
- Dự án tham gia:
${[...new Set([...weeklyReports.data.map(r => r.projects.project_id), ...dailyReports.data.map(r => r.projects.project_id)])]
      .map(pid => `- ${pid}: ${weeklyReports.data.find(r => r.projects.project_id === pid)?.projects.project_name || ''}`)
      .join('\n')}
- Công việc hoàn thành:
${tasks.data.map(t => `- ${t.task_name} (${t.project_id}, ${t.hours_worked || 0} giờ)`).join('\n')}
  `;
  alert(report);
  downloadTextFile(report, `employee_summary_${userId}_${startDate}_${endDate}.txt`);
}

async function showProjectSummary() {
  const projectId = prompt('Nhập ID dự án để xem tổng hợp:');
  if (!projectId) {
    alert('ID dự án không hợp lệ.');
    return;
  }
  const startDate = prompt('Nhập ngày bắt đầu (YYYY-MM-DD):');
  const endDate = prompt('Nhập ngày kết thúc (YYYY-MM-DD):');
  if (!startDate || !endDate) {
    alert('Vui lòng nhập khoảng thời gian hợp lệ.');
    return;
  }
  const [weeklyReports, dailyReports, tasks] = await Promise.all([
    supabase.from('weekly_reports').select('*, users(full_name)').gte('year', startDate.slice(0, 4)).lte('year', endDate.slice(0, 4)).eq('project_id', projectId),
    supabase.from('daily_reports').select('*, users(full_name)').gte('report_date', startDate).lte('report_date', endDate).eq('project_id', projectId),
    supabase.from('tasks').select('*, users(full_name)').gte('due_date', startDate).lte('due_date', endDate).eq('project_id', projectId)
  ]);
  if (weeklyReports.error || dailyReports.error || tasks.error) {
    console.error('Error fetching project summary:', weeklyReports.error || dailyReports.error || tasks.error);
    alert('Lỗi khi lấy dữ liệu tổng hợp.');
    return;
  }
  const totalHours = [
    ...weeklyReports.data.map(r => r.hours_worked || 0),
    ...dailyReports.data.map(r => r.hours_worked || 0)
  ].reduce((sum, h) => sum + h, 0);
  const report = `
Tổng hợp cho dự án ${projectId} từ ${startDate} đến ${endDate}:
- Tổng số giờ làm việc: ${totalHours}
- Thành viên tham gia:
${[...new Set([...weeklyReports.data.map(r => r.user_id), ...dailyReports.data.map(r => r.user_id)])]
      .map(uid => `- ${usersCache[uid] || uid}`)
      .join('\n')}
- Công việc hoàn thành:
${tasks.data.map(t => `- ${t.task_name} (${usersCache[t.assignee] || t.assignee}, ${t.hours_worked || 0} giờ)`).join('\n')}
  `;
  alert(report);
  downloadTextFile(report, `project_summary_${projectId}_${startDate}_${endDate}.txt`);
}

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportReportsCsv() {
  const reports = window.currentReports || [];
  if (reports.length === 0) return;
  let csv = 'Người báo cáo,Tuần,Năm,Dự án,Công việc hoàn thành,Kế hoạch tuần tới,Số giờ\n';
  reports.forEach(r => {
    const row = [
      (usersCache[r.user_id] || r.user_id).replace(/,/g, ' '),
      r.week_number,
      r.year,
      (r.projects.project_name || '').replace(/,/g, ' '),
      '"' + (r.tasks_completed || '').replace(/"/g, '""') + '"',
      '"' + (r.next_week_plan || '').replace(/"/g, '""') + '"',
      r.hours_worked || 0
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

function exportReportsPdf() {
  const reports = window.currentReports || [];
  if (reports.length === 0) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Báo cáo Tuần', 14, 20);
  doc.setFontSize(10);
  const tableColumn = ['Người báo cáo', 'Tuần', 'Năm', 'Dự án', 'Công việc hoàn thành', 'Kế hoạch tuần tới', 'Số giờ'];
  const tableRows = [];
  reports.forEach(r => {
    tableRows.push([
      usersCache[r.user_id] || r.user_id,
      r.week_number,
      r.year,
      r.projects.project_name || '',
      r.tasks_completed || '',
      r.next_week_plan || '',
      r.hours_worked || 0
    ]);
  });
  let startY = 30;
  doc.setFont(undefined, 'bold');
  tableColumn.forEach((col, index) => {
    doc.text(col, 14 + index * 30, startY);
  });
  doc.setFont(undefined, 'normal');
  startY += 6;
  tableRows.forEach(row => {
    row.forEach((cell, idx) => {
      const text = String(cell);
      const xPos = 14 + idx * 30;
      const lines = doc.splitTextToSize(text, 25);
      doc.text(lines, xPos, startY);
    });
    startY += 6;
    if (startY > 280) {
      doc.addPage();
      startY = 20;
    }
  });
  doc.save('weekly_reports.pdf');
}
