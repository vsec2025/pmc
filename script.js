
const SUPABASE_URL = 'https://hziwyxbwqcdittvlhijo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aXd5eGJ3cWNkaXR0dmxoaWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4ODE0MTksImV4cCI6MjA2OTQ1NzQxOX0.7kFGMEOX23Lg3b4imPalbju8G4yHyReuWBVoXVmvxEA';
/*
 * Snippets from script.js - VERSION 2.0
 * Includes logic for project-based weekly reports and daily reports.
 */

// Add new modal reference
const dailyReportModal = new bootstrap.Modal(document.getElementById('dailyReportModal'));

// Add new event listeners in document.addEventListener('DOMContentLoaded', ...)
document.getElementById('addProjectToReportBtn').addEventListener('click', addProjectBlockToReport);
document.getElementById('createDailyReportBtn').addEventListener('click', openNewDailyReportModal);
document.getElementById('saveDailyReportBtn').addEventListener('click', saveDailyReport);


// MODIFIED: Fetch reports with nested details
async function fetchReports() {
  let query = supabase.from('weekly_reports')
    // Use Supabase magic to fetch nested data from related tables
    .select('*, user:users(full_name), details:report_details(*, project:projects(project_name))')
    .order('year', { ascending: false })
    .order('week_number', { ascending: false });

  if (currentUserRole !== 'admin') {
    query = query.eq('user_id', currentUser.id);
  }
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching reports:', error);
    return;
  }
  renderReportsTable(data || []); // Pass to new render function
}

// MODIFIED: Render an expandable table for reports
function renderReportsTable(reports) {
  const tbody = document.querySelector('#reportsTable tbody');
  tbody.innerHTML = '';
  if (reports.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Chưa có báo cáo nào.</td></tr>';
    return;
  }
  reports.forEach(report => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td>${report.user.full_name || report.user_id}</td>
      <td>${report.week_number}</td>
      <td>${report.year}</td>
      <td>Nhấp để xem chi tiết (${report.details.length} mục)</td>
    `;
    
    // Create the hidden details row
    const detailsRow = document.createElement('tr');
    detailsRow.classList.add('report-details-row');
    detailsRow.style.display = 'none'; // Initially hidden
    
    let detailsHtml = '<td colspan="4">';
    report.details.forEach(detail => {
      detailsHtml += `
        <div class="p-2 mb-2 border rounded">
          <h6 class="text-primary">Dự án: ${detail.project.project_name || detail.project_id}</h6>
          <strong>Công việc đã làm:</strong>
          <p class="ms-2">${detail.tasks_completed.replace(/\n/g, '<br>')}</p>
          <strong>Kế hoạch tuần tới:</strong>
          <p class="ms-2">${detail.plan_next_week.replace(/\n/g, '<br>')}</p>
        </div>
      `;
    });
    detailsHtml += '</td>';
    detailsRow.innerHTML = detailsHtml;

    // Add click event to toggle visibility
    tr.addEventListener('click', () => {
      detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    });
    
    tbody.appendChild(tr);
    tbody.appendChild(detailsRow);
  });
  window.currentReports = reports; // For export
}

// MODIFIED: Open weekly report modal and add the first block
async function openNewReportModal() {
  document.getElementById('reportForm').reset();
  const container = document.getElementById('reportDetailsContainer');
  container.innerHTML = ''; // Clear previous blocks
  
  // Pre-fill week/year
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((now - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
  document.getElementById('weekNumberInput').value = weekNumber;
  document.getElementById('reportYearInput').value = now.getFullYear();
  
  await addProjectBlockToReport(); // Add the first project block automatically
  reportModal.show();
}

// NEW: Function to dynamically add a project report block
let projectOptionsCache = null; // Cache project list to avoid re-fetching
async function addProjectBlockToReport() {
  if (!projectOptionsCache) {
    const { data, error } = await supabase.from('projects').select('project_id, project_name').eq('status', 'dang thuc hien');
    if (error) { console.error('Error fetching projects'); return; }
    projectOptionsCache = data.map(p => `<option value="${p.project_id}">${p.project_name}</option>`).join('');
  }

  const container = document.getElementById('reportDetailsContainer');
  const block = document.createElement('div');
  block.className = 'p-3 border rounded mb-3 report-project-block';
  block.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <label class="form-label mb-0"><strong>Dự án</strong></label>
      <button type="button" class="btn-close" aria-label="Remove" onclick="this.parentElement.parentElement.remove()"></button>
    </div>
    <select class="form-select mb-2 project-select" required>${projectOptionsCache}</select>
    <label class="form-label">Công việc đã làm tuần này</label>
    <textarea class="form-control mb-2 tasks-completed" rows="3" required></textarea>
    <label class="form-label">Kế hoạch tuần tới</label>
    <textarea class="form-control plan-next-week" rows="3" required></textarea>
  `;
  container.appendChild(block);
}

// MODIFIED: Save weekly report with details (two-step process)
async function saveReport() {
  const week = parseInt(document.getElementById('weekNumberInput').value);
  const year = parseInt(document.getElementById('reportYearInput').value);
  
  // 1. Insert the main report record to get a report_id
  const { data: reportData, error: reportError } = await supabase
    .from('weekly_reports')
    .insert({ user_id: currentUser.id, week_number: week, year: year })
    .select()
    .single();

  if (reportError) {
    console.error('Error saving main report:', reportError);
    alert('Lỗi khi gửi báo cáo chính.');
    return;
  }
  const report_id = reportData.report_id;

  // 2. Prepare and insert all detail records
  const detailBlocks = document.querySelectorAll('.report-project-block');
  const reportDetails = [];
  detailBlocks.forEach(block => {
    reportDetails.push({
      report_id: report_id,
      project_id: block.querySelector('.project-select').value,
      tasks_completed: block.querySelector('.tasks-completed').value,
      plan_next_week: block.querySelector('.plan-next-week').value,
    });
  });
  
  if (reportDetails.length > 0) {
    const { error: detailsError } = await supabase.from('report_details').insert(reportDetails);
    if (detailsError) {
      console.error('Error saving report details:', detailsError);
      alert('Lỗi khi lưu chi tiết báo cáo.');
      // Consider deleting the main report entry here for consistency
      return;
    }
  }

  reportModal.hide();
  fetchReports();
}

// --- NEW Functions for Daily Reports ---

async function openNewDailyReportModal() {
  document.getElementById('dailyReportForm').reset();
  document.getElementById('dailyReportDateInput').value = new Date().toISOString().split('T')[0];
  
  // Load projects into select
  const select = document.getElementById('dailyReportProjectSelect');
  select.innerHTML = '<option value="">Đang tải...</option>';
  const { data, error } = await supabase.from('projects').select('project_id, project_name');
  if (error) { console.error('Error fetching projects'); return; }
  select.innerHTML = data.map(p => `<option value="${p.project_id}">${p.project_name}</option>`).join('');

  dailyReportModal.show();
}

async function saveDailyReport() {
  const dailyReport = {
    user_id: currentUser.id,
    project_id: document.getElementById('dailyReportProjectSelect').value,
    report_date: document.getElementById('dailyReportDateInput').value,
    summary: document.getElementById('dailyReportSummaryInput').value,
    hours_spent: parseFloat(document.getElementById('dailyReportHoursInput').value) || null,
  };
  
  if (!dailyReport.project_id || !dailyReport.report_date || !dailyReport.summary) {
    alert('Vui lòng điền đầy đủ các trường bắt buộc.');
    return;
  }
  
  const { error } = await supabase.from('daily_reports').insert(dailyReport);
  if (error) {
    console.error('Error saving daily report:', error);
    alert('Lỗi khi lưu báo cáo ngày.');
    return;
  }
  
  dailyReportModal.hide();
  alert('Đã gửi báo cáo ngày thành công!');
}
