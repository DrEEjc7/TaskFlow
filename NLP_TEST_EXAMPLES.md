# TaskFlow NLP Date Parsing - Test Examples

## How to Test
1. Open TaskFlow in your browser (index.html)
2. Type each example below into the "Add a new task" input field
3. Press Enter to create the task
4. Verify that:
   - The date text is removed from the task name
   - A due date badge appears on the right side of the task
   - The badge shows the correct parsed date
   - Toast notification confirms the parsed date

## Test Examples

### Basic Keywords
- **"Buy milk today"**
  - Expected: Task text = "Buy milk" | Due date = "Today"

- **"Call dentist tomorrow"**
  - Expected: Task text = "Call dentist" | Due date = "Tomorrow"

### Day of Week
- **"Team meeting Monday"**
  - Expected: Task text = "Team meeting" | Due date = "Mon, [date]"

- **"Submit report Friday"**
  - Expected: Task text = "Submit report" | Due date = "Fri, [date]"

### Relative Days
- **"Review code in 3 days"**
  - Expected: Task text = "Review code" | Due date = "[3 days from now]"

- **"Prepare presentation in 7 days"**
  - Expected: Task text = "Prepare presentation" | Due date = "[7 days from now]"

### Next Week
- **"Plan sprint next week"**
  - Expected: Task text = "Plan sprint" | Due date = "[7 days from now]"

## Visual Styling Verification

### Today Tasks (Black Badge)
- Tasks due today should have a **black background badge** with white text
- Hover should slightly scale up the badge

### Overdue Tasks (Red Badge with Pulse)
To test this:
1. Create a task with "yesterday" or modify localStorage to set a past date
2. The badge should be **red** and **pulse** subtly
3. Only incomplete tasks should show as overdue

### Future Tasks (Gray Badge)
- Tasks due in the future should have a light gray badge
- Hover should change to darker gray

## Edge Cases to Test
- **"Task with no date text"** - Should create task normally with no badge
- **"today tomorrow Monday"** - Should only parse the first match (today)
- **Case insensitivity**: "buy milk TODAY" vs "Buy Milk today" - Both should work

## Browser Console Check
Open browser console (F12) and verify:
- No JavaScript errors
- Tasks are being saved to localStorage correctly
- Date objects are being serialized/deserialized properly

## Feature Verification Checklist
- [ ] NLP parsing works for all keywords
- [ ] Date text is removed from task name
- [ ] Due date badges appear correctly
- [ ] Badge colors match task status (today, overdue, future)
- [ ] Overdue tasks pulse animation works
- [ ] Toast notifications show parsed dates
- [ ] localStorage persists dates correctly
- [ ] Dates survive page refresh
- [ ] No console errors
