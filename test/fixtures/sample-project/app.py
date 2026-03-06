import openai

client = openai.OpenAI()

response = client.chat.completions.create(
    model='gpt-4',
    messages=[{"role": "user", "content": "Hello"}],
)

backup = client.chat.completions.create(
    model='gemini-pro',
    messages=[{"role": "user", "content": "Hello"}],
)
