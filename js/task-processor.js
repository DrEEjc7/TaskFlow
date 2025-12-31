/**
 * TaskFlow - Task Processing Engine
 * Core task management and data operations. No DOM interaction here.
 */

// === TASK MANAGER ===
class TaskManager {
    static tasks = [];
    static currentId = 1;
    static searchCache = new Map(); // Cache search results
    static statsCache = null; // Cache stats
    static statsCacheTime = 0; // Timestamp of last stats calculation

    /**
     * Create a new task
     */
    static createTask(text, parentId = null, indentLevel = 0) {
        if (!text || !text.trim()) {
            return null;
        }

        const task = {
            id: this.currentId++,
            text: text.trim(),
            completed: false,
            parentId: parentId,
            indentLevel: indentLevel,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.tasks.push(task);
        this.invalidateCache();
        return task;
    }

    /**
     * Update task text
     */
    static updateTask(id, text) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.text = text.trim();
            task.updatedAt = Date.now();
            this.invalidateCache();
            return task;
        }
        return null;
    }

    /**
     * Toggle task completion status
     */
    static toggleComplete(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return null;

        const newCompletedState = !task.completed;
        task.completed = newCompletedState;
        task.updatedAt = Date.now();

        // If completing a parent task, complete all its subtasks
        if (newCompletedState) {
            const subtaskIds = this.getSubtaskIds(id);
            subtaskIds.forEach(subtaskId => {
                const subtask = this.tasks.find(t => t.id === subtaskId);
                if (subtask && !subtask.completed) {
                    subtask.completed = true;
                    subtask.updatedAt = Date.now();
                }
            });
        }

        // If uncompleting a task that has a parent, uncheck the parent
        if (!newCompletedState && task.parentId) {
            const parent = this.tasks.find(t => t.id === task.parentId);
            if (parent && parent.completed) {
                parent.completed = false;
                parent.updatedAt = Date.now();
            }
        }

        // If completing a subtask, check if all siblings are completed to auto-complete parent
        if (newCompletedState && task.parentId) {
            const parent = this.tasks.find(t => t.id === task.parentId);
            if (parent && !parent.completed) {
                const siblings = this.tasks.filter(t => t.parentId === task.parentId);
                const allSiblingsCompleted = siblings.every(s => s.completed);
                if (allSiblingsCompleted) {
                    parent.completed = true;
                    parent.updatedAt = Date.now();
                }
            }
        }

        this.invalidateCache();
        return task;
    }

    /**
     * Delete a task and all its subtasks
     */
    static deleteTask(id) {
        const index = this.tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            const deleted = this.tasks.splice(index, 1)[0];

            // Also delete all subtasks (recursively)
            const subtaskIds = this.getSubtaskIds(id);
            this.tasks = this.tasks.filter(t => !subtaskIds.includes(t.id));

            this.invalidateCache();
            return deleted;
        }
        return null;
    }

    /**
     * Get all subtask IDs recursively
     */
    static getSubtaskIds(parentId) {
        const subtasks = this.tasks.filter(t => t.parentId === parentId);
        const ids = subtasks.map(t => t.id);

        // Recursively get subtasks of subtasks
        subtasks.forEach(subtask => {
            ids.push(...this.getSubtaskIds(subtask.id));
        });

        return ids;
    }

    /**
     * Indent a task (make it a subtask)
     */
    static indentTask(id) {
        const taskIndex = this.tasks.findIndex(t => t.id === id);
        if (taskIndex <= 0) return null; // Can't indent first task

        const task = this.tasks[taskIndex];
        const previousTask = this.tasks[taskIndex - 1];

        // Can only indent up to 3 levels deep
        if (task.indentLevel >= 3) return null;

        // Make this a subtask of the previous task (or its parent if it's already a subtask)
        task.indentLevel = previousTask.indentLevel + 1;
        task.parentId = previousTask.id;
        task.updatedAt = Date.now();

        this.invalidateCache();
        return task;
    }

    /**
     * Outdent a task (reduce indentation)
     */
    static outdentTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task || task.indentLevel === 0) return null;

        task.indentLevel = Math.max(0, task.indentLevel - 1);

        // Update parentId based on new indent level
        if (task.indentLevel === 0) {
            task.parentId = null;
        } else {
            // Find the nearest task above with indentLevel one less
            const taskIndex = this.tasks.findIndex(t => t.id === id);
            for (let i = taskIndex - 1; i >= 0; i--) {
                if (this.tasks[i].indentLevel === task.indentLevel - 1) {
                    task.parentId = this.tasks[i].id;
                    break;
                }
            }
        }

        task.updatedAt = Date.now();
        this.invalidateCache();
        return task;
    }

    /**
     * Delete all completed tasks
     */
    static clearCompleted() {
        const completedCount = this.tasks.filter(t => t.completed).length;
        this.tasks = this.tasks.filter(t => !t.completed);
        this.invalidateCache();
        return completedCount;
    }

    /**
     * Get all tasks
     */
    static getTasks() {
        return this.tasks;
    }

    /**
     * Get tasks by filter
     */
    static getTasksByFilter(filter) {
        switch (filter) {
            case 'active':
                return this.tasks.filter(t => !t.completed);
            case 'completed':
                return this.tasks.filter(t => t.completed);
            case 'all':
            default:
                return this.tasks;
        }
    }

    /**
     * Search tasks with fuzzy matching (cached)
     */
    static searchTasks(query) {
        if (!query || !query.trim()) {
            this.searchCache.clear(); // Clear cache when search is cleared
            return this.tasks;
        }

        const searchTerm = query.toLowerCase().trim();

        // Check cache first
        const cacheKey = `${searchTerm}-${this.tasks.length}`;
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey);
        }

        // Create regex once and reuse
        const pattern = searchTerm.split('').join('.*');
        const fuzzyRegex = new RegExp(pattern, 'i');

        const results = this.tasks.filter(task => {
            const taskText = task.text.toLowerCase();

            // Exact match (faster)
            if (taskText.includes(searchTerm)) {
                return true;
            }

            // Fuzzy match
            return fuzzyRegex.test(task.text);
        });

        // Cache result (limit cache size to prevent memory bloat)
        if (this.searchCache.size > 100) {
            const firstKey = this.searchCache.keys().next().value;
            this.searchCache.delete(firstKey);
        }
        this.searchCache.set(cacheKey, results);

        return results;
    }

    /**
     * Get statistics (cached with 100ms TTL)
     */
    static getStats() {
        const now = Date.now();

        // Return cached stats if less than 100ms old
        if (this.statsCache && (now - this.statsCacheTime) < 100) {
            return this.statsCache;
        }

        // Calculate stats in single pass (instead of filtering twice)
        const total = this.tasks.length;
        let completed = 0;

        for (let i = 0; i < total; i++) {
            if (this.tasks[i].completed) completed++;
        }

        const active = total - completed;

        this.statsCache = {
            total,
            active,
            completed,
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
        };
        this.statsCacheTime = now;

        return this.statsCache;
    }

    /**
     * Get subtask completion stats for a parent task
     */
    static getSubtaskStats(parentId) {
        const subtasks = this.tasks.filter(t => t.parentId === parentId);
        const total = subtasks.length;
        const completed = subtasks.filter(t => t.completed).length;

        return {
            total,
            completed,
            active: total - completed
        };
    }

    /**
     * Invalidate stats cache (call when tasks change)
     */
    static invalidateCache() {
        this.statsCache = null;
        this.searchCache.clear();
    }

    /**
     * Reorder tasks (for drag and drop)
     */
    static reorderTasks(fromIndex, toIndex) {
        if (fromIndex === toIndex) return false;

        const [movedTask] = this.tasks.splice(fromIndex, 1);
        this.tasks.splice(toIndex, 0, movedTask);

        return true;
    }

    /**
     * Save tasks to localStorage
     */
    static saveTasks() {
        try {
            const data = {
                tasks: this.tasks,
                currentId: this.currentId,
                savedAt: Date.now()
            };
            localStorage.setItem('taskflow-data', JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Failed to save tasks:', error);
            return false;
        }
    }

    /**
     * Load tasks from localStorage
     */
    static loadTasks() {
        try {
            const saved = localStorage.getItem('taskflow-data');
            if (saved) {
                const data = JSON.parse(saved);
                this.tasks = (data.tasks || []).map(task => ({
                    ...task,
                    parentId: task.parentId || null,
                    indentLevel: task.indentLevel || 0
                }));
                this.currentId = data.currentId || 1;
                return true;
            }
        } catch (error) {
            console.error('Failed to load tasks:', error);
        }
        return false;
    }

    /**
     * Export tasks as JSON
     */
    static exportToJSON() {
        const data = {
            tasks: this.tasks,
            exportedAt: new Date().toISOString(),
            version: '1.0'
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import tasks from JSON
     */
    static importFromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.tasks && Array.isArray(data.tasks)) {
                this.tasks = data.tasks;
                // Update currentId to be higher than any existing id
                const maxId = Math.max(...this.tasks.map(t => t.id), 0);
                this.currentId = maxId + 1;
                return true;
            }
        } catch (error) {
            console.error('Failed to import tasks:', error);
        }
        return false;
    }

    /**
     * Clear all tasks
     */
    static clearAll() {
        const count = this.tasks.length;
        this.tasks = [];
        this.currentId = 1;
        return count;
    }
}

// === UTILITY FUNCTIONS ===
class TaskUtils {
    /**
     * Debounce function calls
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Format date for display
     */
    static formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    }

    /**
     * Generate unique ID
     */
    static generateId() {
        return `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * Sanitize HTML to prevent XSS
     */
    static sanitize(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Copy text to clipboard
     */
    static async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers (without deprecated execCommand)
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            try {
                // Try modern clipboard API one more time
                document.body.removeChild(textarea);
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                // If all fails, at least clean up
                document.body.removeChild(textarea);
                return false;
            }
        }
    }
}
