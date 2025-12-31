/**
 * TaskFlow - UI Controller
 * Handles DOM, events, and app initialization.
 */
class TaskFlowApp {
    constructor() {
        this.elements = {};
        this.state = {
            theme: localStorage.getItem('taskflow-theme') || 'light',
            currentFilter: 'all',
            searchQuery: '',
            selectedTaskId: null, // Currently selected task for detail panel
            lastRenderedTaskIds: '' // Track rendered tasks to avoid unnecessary re-renders
        };
        this.AUTOSAVE_INTERVAL = 2000; // 2 seconds after last change
        this.saveTimer = null;
        this.searchTimer = null;
        this.rafId = null;
        this.statsRafId = null; // Separate RAF for stats updates
        this.toastTimer = null;

        this.init();
    }

    init() {
        try {
            this.cacheElements();
            this.bindEvents();
            this.setTheme(this.state.theme);
            this.setCurrentYear();
            TaskManager.loadTasks();
            this.renderTasks();
            this.updateStats();
        } catch (error) {
            console.error('Initialization error:', error);
            alert('Failed to initialize TaskFlow. Please refresh the page.');
        }
    }

    cacheElements() {
        // Main elements
        this.elements.newTaskInput = document.getElementById('newTaskInput');
        this.elements.searchInput = document.getElementById('searchInput');
        this.elements.taskList = document.getElementById('taskList');
        this.elements.emptyState = document.getElementById('emptyState');

        // Stats
        this.elements.totalTasks = document.getElementById('totalTasks');
        this.elements.activeTasks = document.getElementById('activeTasks');
        this.elements.completedTasks = document.getElementById('completedTasks');
        this.elements.filterButtons = document.querySelectorAll('.filter-btn');
        this.elements.clearCompletedBtn = document.getElementById('clearCompletedBtn');
        this.elements.exportBtn = document.getElementById('exportBtn');
        this.elements.bulkActions = document.getElementById('bulkActions');
        this.elements.themeToggle = document.getElementById('themeToggle');
        this.elements.toast = document.getElementById('toast');

        // Detail panel elements
        this.elements.detailPanel = document.getElementById('detailPanel');
        this.elements.closeDetail = document.getElementById('closeDetail');
        this.elements.detailCheckbox = document.getElementById('detailCheckbox');
        this.elements.detailTaskText = document.getElementById('detailTaskText');
        this.elements.newSubtaskInput = document.getElementById('newSubtaskInput');
        this.elements.subtaskList = document.getElementById('subtaskList');
        this.elements.emptySubtaskState = document.getElementById('emptySubtaskState');
        this.elements.deleteTaskBtn = document.getElementById('deleteTaskBtn');
    }

    bindEvents() {
        // New task input - Enter to add
        if (this.elements.newTaskInput) {
            this.elements.newTaskInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addTask();
                }
            });
        }

        // Search input with debouncing
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => {
                const query = e.target.value;

                // Clear previous timer
                if (this.searchTimer) {
                    clearTimeout(this.searchTimer);
                }

                // Debounce search
                this.searchTimer = setTimeout(() => {
                    this.state.searchQuery = query;
                    this.renderTasks();
                    this.searchTimer = null;
                }, 250);
            });
        }

        // Event delegation for task list
        if (this.elements.taskList) {
            // Click on task content or meta to open detail panel
            this.elements.taskList.addEventListener('click', (e) => {
                // Check if clicked on content or meta area (not checkbox wrapper)
                if (e.target.closest('.task-content') || e.target.closest('.task-meta')) {
                    const taskItem = e.target.closest('.task-item');
                    if (taskItem) {
                        const taskId = parseInt(taskItem.dataset.taskId);
                        this.openDetailPanel(taskId);
                    }
                }
            });

            // Checkbox toggle
            this.elements.taskList.addEventListener('change', (e) => {
                if (e.target.classList.contains('task-checkbox')) {
                    e.stopPropagation(); // Prevent opening detail panel
                    const taskId = parseInt(e.target.closest('.task-item').dataset.taskId);
                    this.toggleTask(taskId);
                }
            });
        }

        // Detail panel events
        if (this.elements.closeDetail) {
            this.elements.closeDetail.addEventListener('click', () => {
                this.closeDetailPanel();
            });
        }

        if (this.elements.detailCheckbox) {
            this.elements.detailCheckbox.addEventListener('change', () => {
                if (this.state.selectedTaskId) {
                    this.toggleTask(this.state.selectedTaskId);
                }
            });
        }

        if (this.elements.detailTaskText) {
            this.elements.detailTaskText.addEventListener('blur', () => {
                if (this.state.selectedTaskId) {
                    const newText = this.elements.detailTaskText.textContent.trim();
                    if (newText) {
                        TaskManager.updateTask(this.state.selectedTaskId, newText);
                        this.renderTasks();
                        this.scheduleSave();
                    }
                }
            });

            // Enter creates new task below in main list
            this.elements.detailTaskText.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // Save current task
                    const newText = this.elements.detailTaskText.textContent.trim();
                    if (newText) {
                        TaskManager.updateTask(this.state.selectedTaskId, newText);
                    }
                    // Create new task below
                    this.createTaskBelow(this.state.selectedTaskId);
                }
            });
        }

        if (this.elements.newSubtaskInput) {
            this.elements.newSubtaskInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addSubtask();
                }
            });
        }

        if (this.elements.subtaskList) {
            // Subtask checkbox toggle
            this.elements.subtaskList.addEventListener('change', (e) => {
                if (e.target.classList.contains('task-checkbox')) {
                    const subtaskId = parseInt(e.target.closest('.subtask-item').dataset.subtaskId);
                    this.toggleTask(subtaskId);
                }
            });

            // Delete subtask
            this.elements.subtaskList.addEventListener('click', (e) => {
                if (e.target.classList.contains('subtask-delete')) {
                    const subtaskId = parseInt(e.target.closest('.subtask-item').dataset.subtaskId);
                    this.deleteTask(subtaskId);
                }
            });
        }

        if (this.elements.deleteTaskBtn) {
            this.elements.deleteTaskBtn.addEventListener('click', () => {
                if (this.state.selectedTaskId) {
                    this.deleteTask(this.state.selectedTaskId);
                    this.closeDetailPanel();
                }
            });
        }

        // Filter buttons
        this.elements.filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setFilter(btn.dataset.filter);
            });
        });

        // Bulk action buttons
        if (this.elements.clearCompletedBtn) {
            this.elements.clearCompletedBtn.addEventListener('click', () => {
                this.clearCompleted();
            });
        }

        if (this.elements.exportBtn) {
            this.elements.exportBtn.addEventListener('click', () => {
                this.exportTasks();
            });
        }

        // Theme toggle
        if (this.elements.themeToggle) {
            this.elements.themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    // === TASK OPERATIONS ===
    addTask() {
        const input = this.elements.newTaskInput;
        if (!input || !input.value.trim()) return;

        // Parse the input for dates using NLP
        const { cleanText, dueDate } = DateParser.parse(input.value);

        const task = TaskManager.createTask(cleanText, null, 0, dueDate);
        if (task) {
            input.value = '';
            this.renderTasks();
            this.updateStats();
            this.scheduleSave();

            // Show different toast message if date was parsed
            if (dueDate) {
                const dateStr = DateParser.formatDate(dueDate);
                this.showToast(`Task added (Due: ${dateStr})`);
            } else {
                this.showToast('Task added');
            }

            // Keep focus in input for quick multi-add
            requestAnimationFrame(() => {
                input.focus();
            });
        }
    }

    createTaskBelow(currentTaskId) {
        const currentTask = TaskManager.getTasks().find(t => t.id === currentTaskId);
        const currentIndex = TaskManager.getTasks().findIndex(t => t.id === currentTaskId);

        // Create new task
        const newTask = TaskManager.createTask('');

        if (newTask && currentIndex >= 0) {
            // Move new task to position right after current task
            const tasks = TaskManager.getTasks();
            const newTaskIndex = tasks.findIndex(t => t.id === newTask.id);
            if (newTaskIndex !== currentIndex + 1) {
                TaskManager.reorderTasks(newTaskIndex, currentIndex + 1);
            }

            this.renderTasks();
            this.updateStats();
            this.scheduleSave();
            this.closeDetailPanel();
            this.showToast('New task created');
        }
    }

    toggleTask(id) {
        const task = TaskManager.toggleComplete(id);
        if (task) {
            this.renderTasks();
            this.updateStats();
            this.scheduleSave();

            // Update detail panel if this task is selected
            if (this.state.selectedTaskId === id) {
                this.elements.detailCheckbox.checked = task.completed;
            }

            // If it's a parent task, refresh detail panel to show updated subtasks
            if (this.state.selectedTaskId) {
                this.renderSubtasks();
            }

            const message = task.completed ? 'Task completed' : 'Task reopened';
            this.showToast(message);
        }
    }

    deleteTask(id) {
        const deleted = TaskManager.deleteTask(id);
        if (deleted) {
            this.renderTasks();
            this.updateStats();
            this.scheduleSave();
            this.showToast('Task deleted');
        }
    }

    addSubtask() {
        const input = this.elements.newSubtaskInput;
        if (!input || !input.value.trim() || !this.state.selectedTaskId) return;

        const subtask = TaskManager.createTask(input.value, this.state.selectedTaskId);
        if (subtask) {
            input.value = '';
            this.renderTasks();
            this.renderSubtasks();
            this.updateStats();
            this.scheduleSave();
            this.showToast('Subtask added');

            // Keep focus in input
            requestAnimationFrame(() => {
                input.focus();
            });
        }
    }

    clearCompleted() {
        const count = TaskManager.clearCompleted();
        if (count > 0) {
            this.renderTasks();
            this.updateStats();
            this.scheduleSave();
            this.showToast(`${count} completed ${count === 1 ? 'task' : 'tasks'} cleared`);

            // Close detail panel if selected task was deleted
            if (this.state.selectedTaskId && !TaskManager.getTasks().find(t => t.id === this.state.selectedTaskId)) {
                this.closeDetailPanel();
            }
        }
    }

    // === RENDERING ===
    renderTasks() {
        if (!this.elements.taskList || !this.elements.emptyState) return;

        // Get tasks based on current filter and search (only top-level tasks, not subtasks)
        let allTasks = TaskManager.getTasksByFilter(this.state.currentFilter);
        let tasks = allTasks.filter(t => !t.parentId); // Only show top-level tasks

        // Apply search filter
        if (this.state.searchQuery) {
            const searchResults = TaskManager.searchTasks(this.state.searchQuery);
            tasks = searchResults.filter(t => !t.parentId);
        }

        // Show/hide empty state
        if (tasks.length === 0) {
            this.elements.taskList.style.display = 'none';
            this.elements.emptyState.style.display = 'flex';
            return;
        } else {
            this.elements.taskList.style.display = 'block';
            this.elements.emptyState.style.display = 'none';
        }

        // Cancel any pending RAF
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }

        // Use RAF for smooth rendering
        this.rafId = requestAnimationFrame(() => {
            // Use DocumentFragment for efficient DOM construction
            const fragment = document.createDocumentFragment();

            tasks.forEach(task => {
                const taskElement = this.createTaskElement(task);
                fragment.appendChild(taskElement);
            });

            // Single DOM operation
            this.elements.taskList.textContent = '';
            this.elements.taskList.appendChild(fragment);

            // Maintain selection visual state
            if (this.state.selectedTaskId) {
                const selectedElement = document.querySelector(`[data-task-id="${this.state.selectedTaskId}"]`);
                if (selectedElement) {
                    selectedElement.classList.add('selected');
                }
            }

            this.rafId = null;
        });
    }

    createTaskElement(task) {
        const taskDiv = document.createElement('div');
        taskDiv.className = `task-item${task.completed ? ' completed' : ''}`;
        taskDiv.dataset.taskId = task.id;

        // Check if this task has subtasks
        const subtaskStats = TaskManager.getSubtaskStats(task.id);
        if (subtaskStats.total > 0) {
            taskDiv.classList.add('has-subtasks');
        }

        // Left section: Checkbox wrapper
        const checkboxWrapper = document.createElement('div');
        checkboxWrapper.className = 'task-checkbox-wrapper';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.completed;

        checkboxWrapper.appendChild(checkbox);

        // Middle section: Task content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'task-content';

        const textDiv = document.createElement('div');
        textDiv.className = 'task-text';
        textDiv.textContent = task.text || 'Untitled task';

        contentDiv.appendChild(textDiv);

        // Right section: Meta info (due date + badge + chevron)
        const metaDiv = document.createElement('div');
        metaDiv.className = 'task-meta';

        // Due date badge (if has due date)
        if (task.dueDate) {
            const dueDateBadge = document.createElement('span');
            dueDateBadge.className = 'task-due-date';
            dueDateBadge.textContent = DateParser.formatDate(task.dueDate);

            // Add overdue class if past due
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDay = new Date(task.dueDate);
            dueDay.setHours(0, 0, 0, 0);

            if (dueDay < today && !task.completed) {
                dueDateBadge.classList.add('overdue');
            } else if (dueDay.getTime() === today.getTime()) {
                dueDateBadge.classList.add('today');
            }

            metaDiv.appendChild(dueDateBadge);
        }

        // Subtask count badge (if has subtasks)
        if (subtaskStats.total > 0) {
            const countBadge = document.createElement('span');
            countBadge.className = 'subtask-count';
            countBadge.textContent = `${subtaskStats.completed}/${subtaskStats.total}`;
            metaDiv.appendChild(countBadge);
        }

        // Chevron indicator (always show)
        const chevron = document.createElement('span');
        chevron.className = 'task-chevron';
        chevron.textContent = '›';
        metaDiv.appendChild(chevron);

        // Assemble task item
        taskDiv.appendChild(checkboxWrapper);
        taskDiv.appendChild(contentDiv);
        taskDiv.appendChild(metaDiv);

        return taskDiv;
    }

    // === DETAIL PANEL ===
    openDetailPanel(taskId) {
        const task = TaskManager.getTasks().find(t => t.id === taskId);
        if (!task) return;

        this.state.selectedTaskId = taskId;

        // Show panel
        if (this.elements.detailPanel) {
            this.elements.detailPanel.style.display = 'block';
        }

        // Populate task details
        if (this.elements.detailCheckbox) {
            this.elements.detailCheckbox.checked = task.completed;
        }

        if (this.elements.detailTaskText) {
            this.elements.detailTaskText.textContent = task.text;
        }

        // Render subtasks
        this.renderSubtasks();

        // Update selection in list
        this.renderTasks();
    }

    closeDetailPanel() {
        this.state.selectedTaskId = null;

        if (this.elements.detailPanel) {
            this.elements.detailPanel.style.display = 'none';
        }

        // Clear selection in list
        this.renderTasks();
    }

    renderSubtasks() {
        if (!this.state.selectedTaskId || !this.elements.subtaskList || !this.elements.emptySubtaskState) return;

        const subtasks = TaskManager.getTasks().filter(t => t.parentId === this.state.selectedTaskId);

        if (subtasks.length === 0) {
            this.elements.subtaskList.style.display = 'none';
            this.elements.emptySubtaskState.style.display = 'block';
        } else {
            this.elements.subtaskList.style.display = 'flex';
            this.elements.emptySubtaskState.style.display = 'none';

            // Build subtasks list
            const fragment = document.createDocumentFragment();

            subtasks.forEach(subtask => {
                const subtaskElement = this.createSubtaskElement(subtask);
                fragment.appendChild(subtaskElement);
            });

            this.elements.subtaskList.textContent = '';
            this.elements.subtaskList.appendChild(fragment);
        }
    }

    createSubtaskElement(subtask) {
        const subtaskDiv = document.createElement('div');
        subtaskDiv.className = `subtask-item${subtask.completed ? ' completed' : ''}`;
        subtaskDiv.dataset.subtaskId = subtask.id;

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = subtask.completed;

        // Subtask text
        const textSpan = document.createElement('span');
        textSpan.className = 'subtask-text';
        textSpan.textContent = subtask.text;

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'subtask-delete';
        deleteBtn.textContent = '×';
        deleteBtn.setAttribute('aria-label', 'Delete subtask');

        subtaskDiv.appendChild(checkbox);
        subtaskDiv.appendChild(textSpan);
        subtaskDiv.appendChild(deleteBtn);

        return subtaskDiv;
    }

    updateStats() {
        // Cancel any pending stats RAF
        if (this.statsRafId) {
            cancelAnimationFrame(this.statsRafId);
        }

        // Batch stats updates in RAF
        this.statsRafId = requestAnimationFrame(() => {
            const stats = TaskManager.getStats();

            // Update all stats in a single reflow
            if (this.elements.totalTasks) {
                this.elements.totalTasks.textContent = stats.total;
            }
            if (this.elements.activeTasks) {
                this.elements.activeTasks.textContent = stats.active;
            }
            if (this.elements.completedTasks) {
                this.elements.completedTasks.textContent = stats.completed;
            }

            // Show/hide bulk actions
            if (this.elements.bulkActions) {
                this.elements.bulkActions.style.display = stats.completed > 0 ? 'flex' : 'none';
            }

            this.statsRafId = null;
        });
    }

    // === FILTERING ===
    setFilter(filter) {
        this.state.currentFilter = filter;

        // Update active button
        this.elements.filterButtons.forEach(btn => {
            if (btn.dataset.filter === filter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.renderTasks();
    }

    // === AUTO-SAVE ===
    scheduleSave() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }

        this.saveTimer = setTimeout(() => {
            TaskManager.saveTasks();
            this.saveTimer = null;
        }, this.AUTOSAVE_INTERVAL);
    }

    // === IMPORT/EXPORT ===
    exportTasks() {
        const json = TaskManager.exportToJSON();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `taskflow-export-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast('Tasks exported successfully');
    }

    // === THEME ===
    setTheme(theme) {
        this.state.theme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('taskflow-theme', theme);
    }

    toggleTheme() {
        const newTheme = this.state.theme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    // === UTILITIES ===
    setCurrentYear() {
        const yearElement = document.getElementById('currentYear');
        if (yearElement) {
            yearElement.textContent = new Date().getFullYear();
        }
    }

    showToast(message) {
        if (!this.elements.toast) return;

        // Clear any existing toast timer
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.elements.toast.classList.remove('show');
        }

        const messageElement = this.elements.toast.querySelector('.toast-message');
        if (messageElement) {
            messageElement.textContent = message;
        }

        // Use requestAnimationFrame for smooth animation
        requestAnimationFrame(() => {
            this.elements.toast.classList.add('show');
        });

        this.toastTimer = setTimeout(() => {
            this.elements.toast.classList.remove('show');
            this.toastTimer = null;
        }, 2500);
    }

    // === KEYBOARD SHORTCUTS ===
    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + K - Focus search
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            this.elements.searchInput?.focus();
        }

        // Ctrl/Cmd + N - New task
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            this.elements.newTaskInput?.focus();
        }

        // Ctrl/Cmd + Shift + E - Export
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            this.exportTasks();
        }

        // Escape - Close detail panel or clear search
        if (e.key === 'Escape') {
            if (this.state.selectedTaskId) {
                this.closeDetailPanel();
            } else if (this.elements.searchInput === document.activeElement) {
                this.elements.searchInput.value = '';
                this.state.searchQuery = '';
                this.renderTasks();
            } else if (this.elements.toast?.classList.contains('show')) {
                this.elements.toast.classList.remove('show');
            }
        }

        // ? - Show help
        if (e.key === '?' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            this.showHelp();
        }
    }

    showHelp() {
        alert(`TaskFlow Keyboard Shortcuts:

GLOBAL:
Ctrl/Cmd + K - Focus search
Ctrl/Cmd + N - New task
Ctrl/Cmd + Shift + E - Export tasks
Escape - Close detail panel / Clear search
Shift + ? - Show this help

USAGE:
• Click any task to open details & add subtasks
• Press Enter in task name to create new task below
• All changes auto-save every 2 seconds

Simple. Fast. Powerful.`);
    }

    // === CLEANUP ===
    cleanup() {
        // Clear all timers to prevent memory leaks
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (this.searchTimer) {
            clearTimeout(this.searchTimer);
            this.searchTimer = null;
        }
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.statsRafId) {
            cancelAnimationFrame(this.statsRafId);
            this.statsRafId = null;
        }
    }
}

// === APPLICATION STARTUP ===
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.taskFlowApp = new TaskFlowApp();
    } catch (error) {
        console.error('Failed to initialize TaskFlow:', error);
        alert('Failed to start TaskFlow. Please refresh the page.');
    }
});
