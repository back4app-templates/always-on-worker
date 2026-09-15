// Stack: Node.js 22.x | Parse Server 8.x | File: cloud/main.js
// Rules that must survive the container being replaced.
Parse.Cloud.beforeSave("Job", (request) => {
  const job = request.object;
  if (job.isNew()) {
    if (!["fetch-title", "sleep"].includes(job.get("kind"))) throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "unknown job kind.");
    job.set("status", "pending");
  }
});
