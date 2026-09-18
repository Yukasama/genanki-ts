/**
 * Minimal Mustache renderer, just enough for Anki card templates.
 *
 * genanki uses `chevron` for this. Its only job here is computing which fields
 * a template needs (see `Model.req`), so this supports variables, sections,
 * inverted sections and comments over a flat `name -> string` view. Filters
 * like `{{cloze:Text}}` or `{{type:Back}}` are looked up as plain names and
 * render empty, exactly as they do in chevron.
 */

export type View = Readonly<Record<string, string>>;

type Node =
  | { kind: "text"; value: string }
  | { kind: "var"; name: string }
  | { kind: "section"; name: string; inverted: boolean; children: Node[] };

const TAG_RE = /\{\{\{(.+?)\}\}\}|\{\{(.+?)\}\}/gs;

function parse(template: string): Node[] {
  const root: Node[] = [];
  const stack: { name: string; children: Node[] }[] = [{ name: "", children: root }];
  const top = () => stack[stack.length - 1]!.children;

  let last = 0;
  for (const match of template.matchAll(TAG_RE)) {
    if (match.index > last) {
      top().push({ kind: "text", value: template.slice(last, match.index) });
    }
    last = match.index + match[0].length;

    if (match[1] !== undefined) {
      top().push({ kind: "var", name: match[1].trim() });
      continue;
    }

    const tag = match[2]!;
    const sigil = tag[0]!;
    const name = tag.slice(1).trim();
    if (sigil === "!" || sigil === ">") {
      // Comments render nothing; partials are not supported by Anki.
    } else if (sigil === "#" || sigil === "^") {
      const section: Node = { kind: "section", name, inverted: sigil === "^", children: [] };
      top().push(section);
      stack.push({ name, children: section.children });
    } else if (sigil === "/") {
      const open = stack.length > 1 ? stack.pop()! : undefined;
      if (open?.name !== name) {
        throw new Error(`Unexpected closing tag {{/${name}}} in template: ${template}`);
      }
    } else if (sigil === "&") {
      top().push({ kind: "var", name });
    } else {
      top().push({ kind: "var", name: tag.trim() });
    }
  }

  if (last < template.length) {
    top().push({ kind: "text", value: template.slice(last) });
  }
  if (stack.length > 1) {
    throw new Error(`Unclosed section {{#${stack[stack.length - 1]!.name}}} in template: ${template}`);
  }
  return root;
}

function renderNodes(nodes: Node[], view: View): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      out += node.value;
    } else if (node.kind === "var") {
      out += view[node.name] ?? "";
    } else if (Boolean(view[node.name]) !== node.inverted) {
      out += renderNodes(node.children, view);
    }
  }
  return out;
}

export function render(template: string, view: View): string {
  return renderNodes(parse(template), view);
}
