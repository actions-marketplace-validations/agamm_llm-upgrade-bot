const MODEL = "gpt-4o-2024-05-13"
const BACKUP_MODEL = "gpt-3.5-turbo"

export function getCompletion(prompt: string) {
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }] }),
  })
}
