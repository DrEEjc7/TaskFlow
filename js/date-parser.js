/**
 * TaskFlow - Natural Language Date Parser
 * Lightweight date parsing without external dependencies
 */

class DateParser {
    static keywords = {
        today: () => new Date(),
        tomorrow: () => {
            const date = new Date();
            date.setDate(date.getDate() + 1);
            return date;
        },
        monday: () => DateParser.nextDayOfWeek(1),
        tuesday: () => DateParser.nextDayOfWeek(2),
        wednesday: () => DateParser.nextDayOfWeek(3),
        thursday: () => DateParser.nextDayOfWeek(4),
        friday: () => DateParser.nextDayOfWeek(5),
        saturday: () => DateParser.nextDayOfWeek(6),
        sunday: () => DateParser.nextDayOfWeek(0),
    };

    static nextDayOfWeek(targetDay) {
        const date = new Date();
        const currentDay = date.getDay();
        const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
        date.setDate(date.getDate() + daysUntilTarget);
        return date;
    }

    /**
     * Parse task text for dates and extract them
     * @param {string} text - Task text
     * @returns {Object} { cleanText, dueDate }
     */
    static parse(text) {
        if (!text || !text.trim()) {
            return { cleanText: text, dueDate: null };
        }

        let cleanText = text;
        let dueDate = null;

        // Check for keywords (case-insensitive)
        const lowerText = text.toLowerCase();

        for (const [keyword, dateFn] of Object.entries(this.keywords)) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(lowerText)) {
                dueDate = dateFn();
                cleanText = text.replace(regex, '').trim();
                break;
            }
        }

        // Check for "in X days"
        const inDaysMatch = lowerText.match(/\bin (\d+) days?\b/i);
        if (inDaysMatch) {
            const days = parseInt(inDaysMatch[1]);
            const date = new Date();
            date.setDate(date.getDate() + days);
            dueDate = date;
            cleanText = text.replace(inDaysMatch[0], '').trim();
        }

        // Check for "next week"
        if (/\bnext week\b/i.test(lowerText)) {
            const date = new Date();
            date.setDate(date.getDate() + 7);
            dueDate = date;
            cleanText = text.replace(/\bnext week\b/i, '').trim();
        }

        return { cleanText, dueDate };
    }

    /**
     * Format date for display
     * @param {Date} date
     * @returns {string}
     */
    static formatDate(date) {
        if (!date) return '';

        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Reset time for comparison
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());

        if (dateOnly.getTime() === todayOnly.getTime()) {
            return 'Today';
        } else if (dateOnly.getTime() === tomorrowOnly.getTime()) {
            return 'Tomorrow';
        }

        // Format as "Mon, Jan 15"
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
    }
}
