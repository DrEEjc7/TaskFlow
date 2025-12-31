/**
 * TaskFlow - Main Application Controller
 * Handles DOM, events, and app initialization.
 */
class TaskFlowApp {
    constructor() {
        this.elements = {};
        this.state = {
            theme: localStorage.getItem('taskflow-theme') || 'light',
            currentFilter: 'all',
            searchQuery: '',
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
            TaskManager.loadTasks(); // Load saved tasks
            this.bindEvents();
            this.setTheme(this.state.theme);
            this.setCurrentYear();
            this.renderTasks();
            this.updateStats();

            // Global error handler
            window.addEventListener('error', (e) => {
                console.error('Global error:', e.error);
                this.showToast('An error occurred. Please refresh if issues persist.');
            });

            // Save before unload and cleanup
            window.addEventListener('beforeunload', () => {
                this.performSave();
                this.cleanup();
            });
        } catch (error) {
            console.error('Initialization error:', error);
            alert('Failed to initialize TaskFlow. Please refresh the page.');
        }
    }

    cacheElements() {
        // Cache all DOM elements for performance
        this.elements.searchInput = document.getElementById('searchInput');
        this.elements.newTaskInput = document.getElementById('newTaskInput');
        this.elements.taskList = document.getElementById('taskList');
        this.elements.emptyState = document.getElementById('emptyState');
        this.elements.totalTasks = document.getElementById('totalTasks');
        this.elements.activeTasks = document.getElementById('activeTasks');
        this.elements.completedTasks = document.getElementById('completedTasks');
        this.elements.filterButtons = document.querySelectorAll('.filter-btn');
        this.elements.clearCompletedBtn = document.getElementById('clearCompletedBtn');
        this.elements.exportBtn = document.getElementById('exportBtn');
        this.elements.bulkActions = document.getElementById('bulkActions');
        this.elements.themeToggle = document.getElementById('themeToggle');
        this.elements.toast = document.getElementById('toast');
        this.elements.hintBanner = document.getElementById('hintBanner');
        this.elements.closeHint = document.getElementById('closeHint');
    }

    bindEvents() {
        // New task input - Enter to add
        if (this.elements.newTaskInput) {
            this.elements.newTaskInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addTask();
                }
            });

            // Smart paste: create multiple tasks from multi-line paste
            this.elements.newTaskInput.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedText = (e.clipboardData || window.clipboardData).getData('text');
                const lines = pastedText.split('\n').map(line => line.trim()).filter(line => line);

                if (lines.length > 1) {
                    // Multiple lines - create multiple tasks
                    let addedCount = 0;
                    lines.forEach(line => {
                        if (TaskManager.createTask(line)) {
                            addedCount++;
                        }
                    });

                    if (addedCount > 0) {
                        this.renderTasks();
                        this.updateStats();
                        this.scheduleSave();
                        this.showToast(`${addedCount} tasks added`);

                        // Show hint after pasting multiple tasks (if not dismissed before)
                        const taskCount = TaskManager.getTasks().length;
                        if (taskCount >= 2 && !localStorage.getItem('taskflow-hint-dismissed')) {
                            this.showHint();
                        }
                    }
                } else if (lines.length === 1) {
                    // Single line - just insert into input
                    this.elements.newTaskInput.value = lines[0];
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

        // Event delegation for task list (prevents memory leaks from per-task listeners)
        if (this.elements.taskList) {
            this.elements.taskList.addEventListener('change', (e) => {
                if (e.target.classList.contains('task-checkbox')) {
                    const taskId = parseInt(e.target.closest('.task-item').dataset.taskId);
                    this.toggleTask(taskId);
                }
            });

            this.elements.taskList.addEventListener('click', (e) => {
                // Delete button
                if (e.target.classList.contains('task-delete')) {
                    const taskId = parseInt(e.target.closest('.task-item').dataset.taskId);
                    this.deleteTask(taskId);
                }

                // Indent button
                if (e.target.classList.contains('indent-btn') && !e.target.disabled) {
                    const taskId = parseInt(e.target.closest('.task-item').dataset.taskId);
                    this.indentTask(taskId);
                }

                // Outdent button
                if (e.target.classList.contains('outdent-btn') && !e.target.disabled) {
                    const taskId = parseInt(e.target.closest('.task-item').dataset.taskId);
                    this.outdentTask(taskId);
                }
            });

            this.elements.taskList.addEventListener('blur', (e) => {
                if (e.target.classList.contains('task-text')) {
                    const taskItem = e.target.closest('.task-item');
                    const taskId = parseInt(taskItem.dataset.taskId);
                    const originalText = taskItem.dataset.originalText;
                    const newText = e.target.textContent.trim();

                    if (newText !== originalText) {
                        this.updateTaskText(taskId, newText);
                    }
                }
            }, true);

            this.elements.taskList.addEventListener('keydown', (e) => {
                if (e.target.classList.contains('task-text')) {
                    const taskId = parseInt(e.target.closest('.task-item').dataset.taskId);

                    // Enter - Create new task below current one
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.createTaskBelow(taskId);
                    }

                    // Delete task on empty backspace
                    if (e.key === 'Backspace' && e.target.textContent.trim() === '') {
                        e.preventDefault();
                        this.deleteTask(taskId);
                    }

                    // Indent with Tab
                    if (e.key === 'Tab' && !e.shiftKey) {
                        e.preventDefault();
                        this.indentTask(taskId);
                    }

                    // Outdent with Shift+Tab
                    if (e.key === 'Tab' && e.shiftKey) {
                        e.preventDefault();
                        this.outdentTask(taskId);
                    }

                    // Arrow Up - Focus previous task
                    if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this.focusPreviousTask(taskId);
                    }

                    // Arrow Down - Focus next task
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.focusNextTask(taskId);
                    }
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

        // Hint banner close button
        if (this.elements.closeHint) {
            this.elements.closeHint.addEventListener('click', () => {
                this.hideHint();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    // === TASK OPERATIONS ===
    addTask() {
        const input = this.elements.newTaskInput;
        if (!input || !input.value.trim()) return;

        const task = TaskManager.createTask(input.value);
        if (task) {
            input.value = '';
            this.renderTasks();
            this.updateStats();
            this.scheduleSave();
            this.showToast('Task added');

            // Show hint after adding 2nd task (if not dismissed before)
            const taskCount = TaskManager.getTasks().length;
            if (taskCount === 2 && !localStorage.getItem('taskflow-hint-dismissed')) {
                this.showHint();
            }

            // Keep focus in input for quick multi-add
            requestAnimationFrame(() => {
                input.focus();
            });
        }
    }

    toggleTask(id) {
        const task = TaskManager.toggleComplete(id);
        if (task) {
            // Due to cascading completion logic, we need to re-render
            // to update all affected tasks (parent, siblings, subtasks)
            this.renderTasks();
            this.updateStats();
            this.scheduleSave();

            // Show toast
            const message = task.completed ? 'Task completed' : 'Task reopened';
            this.showToast(message);
        }
    }

    updateSubtaskProgress(taskId) {
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (!taskElement) return;

        const subtaskStats = TaskManager.getSubtaskStats(taskId);
        let progressBadge = taskElement.querySelector('.subtask-progress');

        if (subtaskStats.total > 0) {
            // Add or update the progress badge
            if (!progressBadge) {
                progressBadge = document.createElement('span');
                progressBadge.className = 'subtask-progress';

                // Insert before delete button
                const deleteBtn = taskElement.querySelector('.task-delete');
                taskElement.insertBefore(progressBadge, deleteBtn);
            }

            progressBadge.textContent = `${subtaskStats.completed}/${subtaskStats.total}`;

            // Toggle completed class based on all subtasks being done
            if (subtaskStats.completed === subtaskStats.total) {
                progressBadge.classList.add('completed');
            } else {
                progressBadge.classList.remove('completed');
            }
        } else if (progressBadge) {
            // Remove badge if no subtasks
            progressBadge.remove();
        }
    }

    updateTaskText(id, newText) {
        if (!newText.trim()) {
            this.deleteTask(id);
            return;
        }

        const task = TaskManager.updateTask(id, newText);
        if (task) {
            // Update the data attribute so next blur comparison is correct
            const taskElement = document.querySelector(`[data-task-id="${id}"]`);
            if (taskElement) {
                taskElement.dataset.originalText = task.text;
            }
            this.scheduleSave();
        }
    }

    deleteTask(id) {
        const deleted = TaskManager.deleteTask(id);
        if (deleted) {
            // Animate out before removing
            const taskElement = document.querySelector(`[data-task-id="${id}"]`);
            if (taskElement) {
                taskElement.style.animation = 'slideOutRight 0.3s ease-out';
                setTimeout(() => {
                    this.renderTasks();
                    this.updateStats();
                }, 300);
            }

            this.scheduleSave();
            this.showToast('Task deleted');
        }
    }

    createTaskBelow(currentTaskId) {
        // Save current task text first
        const currentTaskElement = document.querySelector(`[data-task-id="${currentTaskId}"]`);
        const currentTextDiv = currentTaskElement?.querySelector('.task-text');
        if (currentTextDiv) {
            const newText = currentTextDiv.textContent.trim();
            if (newText) {
                TaskManager.updateTask(currentTaskId, newText);
            }
        }

        // Get current task to preserve indent level
        const currentTask = TaskManager.getTasks().find(t => t.id === currentTaskId);
        const currentIndex = TaskManager.getTasks().findIndex(t => t.id === currentTaskId);

        // Create new task with same indent level as current task
        const newTask = TaskManager.createTask('', null, currentTask?.indentLevel || 0);

        if (newTask && currentIndex >= 0) {
            // Move new task to position right after current task
            const tasks = TaskManager.getTasks();
            const newTaskIndex = tasks.findIndex(t => t.id === newTask.id);
            if (newTaskIndex !== currentIndex + 1) {
                TaskManager.reorderTasks(newTaskIndex, currentIndex + 1);
            }

            // Set parent if current task is a subtask
            if (currentTask?.parentId) {
                newTask.parentId = currentTask.parentId;
            }

            this.renderTasks();
            this.updateStats();
            this.scheduleSave();

            // Focus the new task after render
            requestAnimationFrame(() => {
                const newTaskElement = document.querySelector(`[data-task-id="${newTask.id}"]`);
                const newTextDiv = newTaskElement?.querySelector('.task-text');
                if (newTextDiv) {
                    newTextDiv.focus();
                    // Place cursor at end
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(newTextDiv);
                    range.collapse(false);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
        }
    }

    focusPreviousTask(currentTaskId) {
        const tasks = TaskManager.getTasks();
        const currentIndex = tasks.findIndex(t => t.id === currentTaskId);

        if (currentIndex > 0) {
            const previousTask = tasks[currentIndex - 1];
            const previousElement = document.querySelector(`[data-task-id="${previousTask.id}"]`);
            const textDiv = previousElement?.querySelector('.task-text');
            if (textDiv) {
                textDiv.focus();
                // Place cursor at end
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(textDiv);
                range.collapse(false);
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        }
    }

    focusNextTask(currentTaskId) {
        const tasks = TaskManager.getTasks();
        const currentIndex = tasks.findIndex(t => t.id === currentTaskId);

        if (currentIndex < tasks.length - 1) {
            const nextTask = tasks[currentIndex + 1];
            const nextElement = document.querySelector(`[data-task-id="${nextTask.id}"]`);
            const textDiv = nextElement?.querySelector('.task-text');
            if (textDiv) {
                textDiv.focus();
                // Place cursor at end
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(textDiv);
                range.collapse(false);
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        }
    }

    indentTask(id) {
        const result = TaskManager.indentTask(id);
        if (result) {
            this.renderTasks();
            this.scheduleSave();
        } else {
            // Provide feedback when indent fails
            const task = TaskManager.getTasks().find(t => t.id === id);
            const taskIndex = TaskManager.getTasks().findIndex(t => t.id === id);

            if (taskIndex === 0) {
                this.showToast('Cannot indent the first task');
            } else if (task && task.indentLevel >= 3) {
                this.showToast('Maximum nesting level (3) reached');
            }
        }
    }

    outdentTask(id) {
        const result = TaskManager.outdentTask(id);
        if (result) {
            this.renderTasks();
            this.scheduleSave();
        } else {
            // Provide feedback when outdent fails
            this.showToast('Task is already at top level');
        }
    }

    clearCompleted() {
        const count = TaskManager.clearCompleted();
        if (count > 0) {
            this.renderTasks();
            this.updateStats();
            this.scheduleSave();
            this.showToast(`${count} completed ${count === 1 ? 'task' : 'tasks'} cleared`);
        }
    }

    // === RENDERING ===
    renderTasks() {
        if (!this.elements.taskList) return;

        // Get tasks based on current filter and search
        let tasks = TaskManager.getTasksByFilter(this.state.currentFilter);

        // Apply search filter
        if (this.state.searchQuery) {
            tasks = TaskManager.searchTasks(this.state.searchQuery);
        }

        // Create a lightweight signature using IDs (faster than full text comparison)
        const taskSignature = tasks.length > 0 ? tasks.map(t => t.id).join('-') : '';

        // Skip re-render if task IDs haven't changed
        if (taskSignature === this.state.lastRenderedTaskIds && tasks.length > 0) {
            return;
        }

        this.state.lastRenderedTaskIds = taskSignature;

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

            // Pre-calculate task indices to avoid O(n²) in createTaskElement
            const taskIndexMap = new Map();
            tasks.forEach((task, index) => {
                taskIndexMap.set(task.id, index);
            });

            tasks.forEach(task => {
                const taskIndex = taskIndexMap.get(task.id);
                const taskElement = this.createTaskElement(task, taskIndex);
                fragment.appendChild(taskElement);
            });

            // Single DOM operation
            this.elements.taskList.textContent = '';
            this.elements.taskList.appendChild(fragment);

            this.rafId = null;
        });
    }

    createTaskElement(task, taskIndex) {
        const taskDiv = document.createElement('div');
        taskDiv.className = `task-item${task.completed ? ' completed' : ''}`;
        taskDiv.dataset.taskId = task.id;
        taskDiv.dataset.originalText = task.text;

        // Add indent level data attribute
        if (task.indentLevel > 0) {
            taskDiv.dataset.indentLevel = task.indentLevel;
        }

        // Check if this task has subtasks
        const subtaskStats = TaskManager.getSubtaskStats(task.id);
        if (subtaskStats.total > 0) {
            taskDiv.classList.add('has-subtasks');
        }

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.completed;

        // Task text (contenteditable for inline editing)
        const textDiv = document.createElement('div');
        textDiv.className = 'task-text';
        textDiv.contentEditable = 'true';
        textDiv.textContent = task.text;
        textDiv.setAttribute('data-placeholder', 'Type task...');

        taskDiv.appendChild(checkbox);
        taskDiv.appendChild(textDiv);

        // Subtask progress badge (if has subtasks)
        if (subtaskStats.total > 0) {
            const progressBadge = document.createElement('span');
            progressBadge.className = 'subtask-progress';
            if (subtaskStats.completed === subtaskStats.total) {
                progressBadge.classList.add('completed');
            }
            progressBadge.textContent = `${subtaskStats.completed}/${subtaskStats.total}`;
            taskDiv.appendChild(progressBadge);
        }

        // Action buttons container (shows on hover)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'task-actions';

        // Outdent button (⮔) - only if can be outdented
        if (task.indentLevel > 0) {
            const outdentBtn = document.createElement('button');
            outdentBtn.className = 'task-action-btn outdent-btn';
            outdentBtn.innerHTML = '⮔';
            outdentBtn.setAttribute('aria-label', 'Remove indent');
            outdentBtn.setAttribute('title', 'Remove indent (Shift+Tab)');
            actionsDiv.appendChild(outdentBtn);
        }

        // Indent button (⮕) - only if can be indented
        if (taskIndex > 0 && task.indentLevel < 3) {
            const indentBtn = document.createElement('button');
            indentBtn.className = 'task-action-btn indent-btn';
            indentBtn.innerHTML = '⮕';
            indentBtn.setAttribute('aria-label', 'Make subtask');
            indentBtn.setAttribute('title', 'Make subtask (Tab)');
            actionsDiv.appendChild(indentBtn);
        }

        // Only append actions div if it has buttons
        if (actionsDiv.children.length > 0) {
            taskDiv.appendChild(actionsDiv);
        }

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'task-delete';
        deleteBtn.textContent = '×';
        deleteBtn.setAttribute('aria-label', 'Delete task');
        deleteBtn.setAttribute('title', 'Delete task');

        taskDiv.appendChild(deleteBtn);

        return taskDiv;
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

    // === THEME MANAGEMENT ===
    setTheme(theme) {
        this.state.theme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('taskflow-theme', theme);
        this.updateThemeIcon(theme);
    }

    toggleTheme() {
        const newTheme = this.state.theme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    updateThemeIcon(theme) {
        if (!this.elements.themeToggle) return;

        const sunIcon = `<svg class="theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>`;

        const moonIcon = `<svg class="theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>`;

        this.elements.themeToggle.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
    }

    // === AUTO-SAVE ===
    scheduleSave() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }

        this.saveTimer = setTimeout(() => {
            this.performSave();
        }, this.AUTOSAVE_INTERVAL);
    }

    performSave() {
        const success = TaskManager.saveTasks();
        if (!success) {
            console.error('Failed to auto-save tasks');
        }
    }

    // === EXPORT ===
    exportTasks() {
        try {
            const json = TaskManager.exportToJSON();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().slice(0, 10);
            const filename = `taskflow-export-${timestamp}.json`;

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            this.showToast('Tasks exported successfully');
        } catch (error) {
            console.error('Export failed:', error);
            this.showToast('Export failed. Please try again.');
        }
    }

    // === UI UTILITIES ===
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

    setCurrentYear() {
        const yearElement = document.getElementById('currentYear');
        if (yearElement) {
            yearElement.textContent = new Date().getFullYear();
        }
    }

    // === KEYBOARD SHORTCUTS ===
    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + K - Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            this.elements.searchInput?.focus();
        }

        // Ctrl/Cmd + N - New task
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            this.elements.newTaskInput?.focus();
        }

        // Ctrl/Cmd + Shift + E - Export
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            this.exportTasks();
        }

        // Escape - Clear search, close toast, or close hint
        if (e.key === 'Escape') {
            if (this.elements.hintBanner?.style.display !== 'none') {
                this.hideHint();
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

    // === HINT BANNER ===
    showHint() {
        if (this.elements.hintBanner) {
            this.elements.hintBanner.style.display = 'flex';
        }
    }

    hideHint() {
        if (this.elements.hintBanner) {
            this.elements.hintBanner.style.display = 'none';
            localStorage.setItem('taskflow-hint-dismissed', 'true');
        }
    }

    showHelp() {
        alert(`TaskFlow Keyboard Shortcuts:

GLOBAL:
Ctrl/Cmd + K - Focus search
Ctrl/Cmd + N - New task
Ctrl/Cmd + Shift + E - Export tasks
Escape - Clear search / Close notifications
Shift + ? - Show this help

TASK EDITING:
Enter - Create new task below
↑ / ↓ - Navigate between tasks
Tab - Indent task (make subtask)
Shift + Tab - Outdent task
Backspace (on empty) - Delete task

Note: Tasks auto-save every 2 seconds.`);
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
    }
});
