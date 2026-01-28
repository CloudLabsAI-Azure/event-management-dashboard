Build a scheduled automation that runs once per day and:

1. Queries Azure DevOps work items of type "Event Summary Log"
2. Filters only newly created or updated items since last run
3. For each item:
   - Read Title, EventDate, and Custom_Feedback field
4. If Custom_Feedback is not empty and contains images:
   - Parse HTML
   - Extract image URLs or attachments
   - Download images
   - Upload them into the Feedback/History field
   - Also append Title and Event Date
5. Mark the work item as processed using a tag or custom field
6. Skip already processed items on next run
7. Add logging and error handling
