# Markdown Studio — Kitchen Sink

A document that exercises **every** element the editor should render. *Italic*, **bold**, ***bold italic***, ~~strikethrough~~, `inline code`, ==highlighted==, and a [link to Tiptap](https://tiptap.dev).

## Headings

### Third level

#### Fourth level

##### Fifth level

###### Sixth level

## Lists

- Apples
- Bananas
  - Nested bullet
  - Another nested bullet
- Cherries

1. First step
2. Second step
   1. Nested ordered
   2. Nested ordered again
3. Third step

- [ ] Write the app
- [x] Render markdown
- [ ] Ship a DMG

## Blockquote

> Simplicity is the ultimate sophistication.
>
> — attributed to Leonardo da Vinci

## Code

```javascript
function greet(name) {
  const message = `Hello, ${name}!`; // template literal
  console.log(message);
  return message.length > 0;
}
```

```python
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

## Table

| Feature        | Status | Notes                    |
| -------------- | ------ | ------------------------ |
| Headings       | Done   | Levels 1–6               |
| Tables         | Done   | GFM pipe tables          |
| Task lists     | Done   | Click to toggle          |
| Slash commands | Done   | Type `/` anywhere        |

## Image

![Sample icon](icon.png)

---

Line one with a hard break  
line two after the break.

Final paragraph with a footnote-like reference and an autolink: https://example.com
