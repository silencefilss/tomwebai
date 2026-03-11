/* ============================================
   TOM.AIWEB — PLATFORM SCRIPTS
   Server-authenticated module navigation,
   video player, progress tracking.
   ============================================ */

/* Module data structure */
const MODULES = [
  {
    id: 1,
    title: 'Les bases du codage',
    lessons: [
      { id: '1-1', title: 'Comment fonctionne HTML', duration: '12:00' },
      { id: '1-2', title: 'Comment fonctionne CSS', duration: '14:30' },
      { id: '1-3', title: 'Comment fonctionne JavaScript', duration: '18:00' },
      { id: '1-4', title: 'Introduction à React', duration: '15:45' },
      { id: '1-5', title: 'Introduction à Node.js', duration: '13:20' },
    ]
  },
  {
    id: 2,
    title: 'Créer un site 100% avec l\'IA',
    lessons: [
      { id: '2-1', title: 'Présentation d\'Antigravity', duration: '10:00' },
      { id: '2-2', title: 'Installer et configurer l\'outil', duration: '8:30' },
      { id: '2-3', title: 'Générer son premier site complet', duration: '25:00' },
      { id: '2-4', title: 'Prompt engineering : bien formuler ses demandes', duration: '16:45' },
    ]
  },
  {
    id: 3,
    title: 'Corriger & perfectionner le site',
    lessons: [
      { id: '3-1', title: 'Comprendre les erreurs de l\'IA', duration: '11:00' },
      { id: '3-2', title: 'Corriger en re-promptant efficacement', duration: '18:30' },
      { id: '3-3', title: 'Rendre le site responsive (mobile/tablette)', duration: '20:15' },
      { id: '3-4', title: 'Finitions et polish final', duration: '14:00' },
    ]
  },
  {
    id: 4,
    title: 'Montrer le site au client (gratuit)',
    lessons: [
      { id: '4-1', title: 'Créer un compte GitHub', duration: '6:00' },
      { id: '4-2', title: 'Déployer avec GitHub Pages', duration: '12:30' },
      { id: '4-3', title: 'Partager le lien au client', duration: '5:45' },
      { id: '4-4', title: 'Mettre à jour le site déployé', duration: '8:15' },
    ]
  },
  {
    id: 5,
    title: 'Héberger pour de vrai (IONOS)',
    lessons: [
      { id: '5-1', title: 'Acheter un nom de domaine', duration: '9:00' },
      { id: '5-2', title: 'Configurer l\'hébergement IONOS', duration: '14:30' },
      { id: '5-3', title: 'Mettre le site en ligne', duration: '11:45' },
      { id: '5-4', title: 'Lier domaine et hébergement', duration: '10:00' },
    ]
  },
  {
    id: 6,
    title: 'Trouver des clients',
    lessons: [
      { id: '6-1', title: 'La méthode Google Maps', duration: '15:00' },
      { id: '6-2', title: 'Identifier les commerces sans site web', duration: '12:30' },
      { id: '6-3', title: 'Construire sa liste de prospects', duration: '10:45' },
      { id: '6-4', title: 'Qualifier et prioriser ses leads', duration: '9:15' },
    ]
  },
  {
    id: 7,
    title: 'Démarcher & closer',
    lessons: [
      { id: '7-1', title: 'Le premier contact (script d\'approche)', duration: '14:00' },
      { id: '7-2', title: 'Présenter son offre', duration: '16:30' },
      { id: '7-3', title: 'Techniques de closing', duration: '19:00' },
      { id: '7-4', title: 'Gérer les objections et signer', duration: '13:45' },
    ]
  }
];

/* ============================================
   STORAGE KEY (progress is still local
   since it's per-user browser data)
   ============================================ */
const PROGRESS_KEY = 'tomaiweb_progress';

/* ============================================
   INIT
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  const isPlatformPage = document.body.classList.contains('platform-page');
  if (!isPlatformPage) return;

  // Verify auth server-side before initializing
  verifyAuth().then(data => {
    if (!data.authenticated) {
      window.location.href = '/login.html';
      return;
    }
    initPlatform(data.user);
  });
});

/* ============================================
   AUTH — Server verification
   ============================================ */
async function verifyAuth() {
  try {
    const res = await fetch('/auth/status');
    return await res.json();
  } catch {
    return { authenticated: false };
  }
}

/* ============================================
   PLATFORM INIT
   ============================================ */
function initPlatform(user) {
  initUserDisplay(user);
  initLogout();
  initModuleToggle();
  initLessonNavigation();
  initSidebarMobile();
  initStartButton();
  loadProgress();
}

/* Display user info */
function initUserDisplay(user) {
  const badge = document.getElementById('member-badge');
  if (badge && user) {
    badge.innerHTML = `
      <span class="member-dot"></span>
      ${user.displayName || user.username}
    `;
  }
}

/* Logout — server-side */
function initLogout() {
  const btn = document.getElementById('btn-logout');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      await fetch('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors — redirect anyway
    }
    window.location.href = '/login.html';
  });
}

/* Module accordion toggle */
function initModuleToggle() {
  document.querySelectorAll('.module-header').forEach(header => {
    header.addEventListener('click', () => {
      const moduleEl = header.closest('.sidebar-module');
      const isOpen = moduleEl.classList.contains('open');

      // Close all modules
      document.querySelectorAll('.sidebar-module').forEach(m => m.classList.remove('open'));

      // Toggle clicked module
      if (!isOpen) {
        moduleEl.classList.add('open');
      }
    });
  });
}

/* Lesson click → load video */
let currentLesson = null;
let allLessons = [];

function initLessonNavigation() {
  // Build flat lesson list
  MODULES.forEach(mod => {
    mod.lessons.forEach(lesson => {
      allLessons.push({ ...lesson, moduleId: mod.id, moduleTitle: mod.title });
    });
  });

  // Attach click handlers
  document.querySelectorAll('.lesson-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const lessonId = link.dataset.lesson;
      loadLesson(lessonId);
    });
  });

  // Prev/Next buttons
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  if (btnPrev) btnPrev.addEventListener('click', () => navigateLesson(-1));
  if (btnNext) btnNext.addEventListener('click', () => navigateLesson(1));

  // Mark complete button
  const btnComplete = document.getElementById('btn-mark-complete');
  if (btnComplete) {
    btnComplete.addEventListener('click', () => {
      if (currentLesson) {
        toggleLessonComplete(currentLesson.id);
      }
    });
  }
}

function loadLesson(lessonId) {
  const lesson = allLessons.find(l => l.id === lessonId);
  if (!lesson) return;

  currentLesson = lesson;

  // Show video state, hide welcome
  const welcome = document.getElementById('welcome-state');
  const videoState = document.getElementById('video-state');
  if (welcome) welcome.style.display = 'none';
  if (videoState) videoState.style.display = 'block';

  // Update breadcrumb
  const bcModule = document.querySelector('.bc-module');
  const bcLesson = document.querySelector('.bc-lesson');
  if (bcModule) bcModule.textContent = `Module ${lesson.moduleId}`;
  if (bcLesson) bcLesson.textContent = lesson.title;

  // Update video placeholder
  const vpTitle = document.getElementById('vp-title');
  if (vpTitle) vpTitle.textContent = lesson.title;

  // Update video info
  const videoTitle = document.getElementById('video-title');
  const videoModuleLabel = document.getElementById('video-module-label');
  if (videoTitle) videoTitle.textContent = lesson.title;
  if (videoModuleLabel) videoModuleLabel.textContent = `Module ${lesson.moduleId} — ${lesson.moduleTitle}`;

  // Update active lesson in sidebar
  document.querySelectorAll('.lesson-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.lesson-link[data-lesson="${lessonId}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Open the parent module
  document.querySelectorAll('.sidebar-module').forEach(m => m.classList.remove('open'));
  const parentModule = document.querySelector(`.sidebar-module[data-module="${lesson.moduleId}"]`);
  if (parentModule) parentModule.classList.add('open');

  // Update mark complete button state
  updateCompleteButton(lessonId);

  // Update prev/next buttons
  updateNavButtons();

  // Close mobile sidebar if open
  closeMobileSidebar();
}

function navigateLesson(direction) {
  if (!currentLesson) return;
  const currentIndex = allLessons.findIndex(l => l.id === currentLesson.id);
  const nextIndex = currentIndex + direction;

  if (nextIndex >= 0 && nextIndex < allLessons.length) {
    loadLesson(allLessons[nextIndex].id);
  }
}

function updateNavButtons() {
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  if (!currentLesson) return;

  const currentIndex = allLessons.findIndex(l => l.id === currentLesson.id);
  if (btnPrev) btnPrev.disabled = currentIndex <= 0;
  if (btnNext) btnNext.disabled = currentIndex >= allLessons.length - 1;
}

/* Start button */
function initStartButton() {
  const btn = document.getElementById('btn-start');
  if (btn) {
    btn.addEventListener('click', () => {
      // Find first incomplete lesson, or first lesson
      const progress = getProgress();
      const firstIncomplete = allLessons.find(l => !progress.includes(l.id));
      loadLesson(firstIncomplete ? firstIncomplete.id : allLessons[0].id);
    });
  }
}

/* ============================================
   PROGRESS TRACKING (localStorage)
   ============================================ */
function getProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveProgress(completed) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed));
}

function toggleLessonComplete(lessonId) {
  let completed = getProgress();

  if (completed.includes(lessonId)) {
    completed = completed.filter(id => id !== lessonId);
  } else {
    completed.push(lessonId);
  }

  saveProgress(completed);
  updateUI();
  updateCompleteButton(lessonId);
}

function updateCompleteButton(lessonId) {
  const btn = document.getElementById('btn-mark-complete');
  if (!btn) return;

  const completed = getProgress();
  const isComplete = completed.includes(lessonId);

  btn.classList.toggle('completed', isComplete);
  btn.innerHTML = isComplete
    ? '<span class="bmc-icon">✓</span> Terminé'
    : '<span class="bmc-icon">✓</span> Marquer comme terminé';
}

function loadProgress() {
  updateUI();

  // Open first module by default
  const firstModule = document.querySelector('.sidebar-module[data-module="1"]');
  if (firstModule) firstModule.classList.add('open');
}

function updateUI() {
  const completed = getProgress();
  const totalLessons = allLessons.length;
  const completedCount = completed.length;
  const percentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // Update progress bar
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  if (fill) fill.style.width = percentage + '%';
  if (text) text.textContent = `${percentage}% complété (${completedCount}/${totalLessons})`;

  // Update lesson checkmarks
  document.querySelectorAll('.lesson-check').forEach(check => {
    const lessonId = check.dataset.check;
    check.classList.toggle('completed', completed.includes(lessonId));
  });

  // Update module statuses
  MODULES.forEach(mod => {
    const allModuleLessons = mod.lessons.map(l => l.id);
    const allComplete = allModuleLessons.every(id => completed.includes(id));
    const statusEl = document.querySelector(`.module-status[data-module-check="${mod.id}"]`);
    if (statusEl) statusEl.classList.toggle('completed', allComplete);
  });
}

/* ============================================
   MOBILE SIDEBAR
   ============================================ */
function initSidebarMobile() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  });

  if (overlay) {
    overlay.addEventListener('click', closeMobileSidebar);
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('visible');
}
