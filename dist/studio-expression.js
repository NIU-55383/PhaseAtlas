// Restricted mathematical expressions. No eval, generated code, or property access.
const FUNCTIONS = new Map([
  ['sin', [1, Math.sin]], ['cos', [1, Math.cos]], ['tanh', [1, Math.tanh]],
  ['exp', [1, Math.exp]], ['log', [1, Math.log]], ['sqrt', [1, Math.sqrt]],
  ['abs', [1, Math.abs]], ['min', [2, Math.min]], ['max', [2, Math.max]],
]);
const DERIVATIVES = new Set(['D', 'Dx', 'Dy', 'lap', 'biharm']);
export const FIELD_NAMES = ['u', 'v', 'w'];
const RESERVED = new Set([...FIELD_NAMES, 'x', 'y', 't', 'pi', 'e', 'Lx', 'Ly', ...FUNCTIONS.keys(), ...DERIVATIVES]);
const num = value => ({type: 'number', value});
const binary = (op, left, right) => ({type: 'binary', op, left, right});

export function parseExpression(source, symbols = []) {
  if (typeof source !== 'string' || !source.trim() || source.length > 1200) throw Error('Enter a mathematical expression of 1–1200 characters.');
  const allowed = new Set(['pi', 'e', ...symbols]);
  const tokens = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) { cursor++; continue; }
    const rest = source.slice(cursor);
    const match = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^[A-Za-z][A-Za-z0-9_]*|^[+\-*/^(),]/);
    if (!match) throw Error(`Unexpected character at position ${cursor + 1}. Use mathematical syntax only.`);
    tokens.push(match[0]); cursor += match[0].length;
    if (tokens.length > 400) throw Error('Expression is too complex; split it into simpler equations.');
  }
  let position = 0, depth = 0;
  function take(value) { if (tokens[position] === value) { position++; return true; } return false; }
  function expression(minimum = 0) {
    if (++depth > 40) throw Error('Expression nesting exceeds 40 levels.');
    let left;
    const token = tokens[position++];
    if (token === '+' || token === '-') left = {type: 'unary', op: token, child: expression(25)};
    else if (token === '(') { left = expression(); if (!take(')')) throw Error('Missing closing parenthesis.'); }
    else if (token && /^(?:\d|\.)/.test(token)) {
      const value = Number(token); if (!Number.isFinite(value)) throw Error('Numeric constants must be finite.');
      left = num(value);
    } else if (token && /^[A-Za-z]/.test(token)) {
      if (take('(')) {
        if (!FUNCTIONS.has(token) && !DERIVATIVES.has(token)) throw Error(`Unknown function: ${token}.`);
        const args = [expression()];
        while (take(',')) args.push(expression());
        if (!take(')')) throw Error(`Missing closing parenthesis in ${token}.`);
        const expected = FUNCTIONS.get(token)?.[0] || (['D', 'Dx', 'Dy'].includes(token) ? 2 : 1);
        if (args.length !== expected) throw Error(`${token} expects ${expected} argument(s). Example: Dx(u, 1).`);
        if (expected === 2 && DERIVATIVES.has(token) && (args[1].type !== 'number' || !Number.isInteger(args[1].value) || args[1].value < 1 || args[1].value > 4)) throw Error('Derivative order must be an integer literal from 1 to 4.');
        left = {type: 'call', name: token, args};
      } else {
        if (!allowed.has(token)) throw Error(`Unknown symbol: ${token}. Define it in Parameters or use an active field.`);
        left = {type: 'variable', name: token};
      }
    } else throw Error('Incomplete expression. Use explicit multiplication, for example 2*u.');
    const precedence = {'+': 10, '-': 10, '*': 20, '/': 20, '^': 30};
    while (precedence[tokens[position]] !== undefined && precedence[tokens[position]] >= minimum) {
      const op = tokens[position++], priority = precedence[op];
      left = binary(op, left, expression(op === '^' ? priority : priority + 1));
    }
    depth--; return left;
  }
  const ast = expression();
  if (position !== tokens.length) throw Error(`Unexpected '${tokens[position]}'. Write multiplication explicitly with *.`);
  if (derivativeOrder(ast) > 4) throw Error('Total derivative order must not exceed four.');
  return ast;
}

export function derivativeOrder(ast) {
  if (ast.type === 'unary') return derivativeOrder(ast.child);
  if (ast.type === 'binary') return Math.max(derivativeOrder(ast.left), derivativeOrder(ast.right));
  if (ast.type !== 'call') return 0;
  const inside = Math.max(...ast.args.map(derivativeOrder));
  return inside + (DERIVATIVES.has(ast.name) ? ast.name === 'lap' ? 2 : ast.name === 'biharm' ? 4 : ast.args[1].value : 0);
}

function mapValues(args, fn, size) {
  if (args.every(a => typeof a === 'number')) return fn(...args);
  const out = new Float64Array(size);
  const a = args[0], b = args[1], sa = typeof a === 'number', sb = typeof b === 'number';
  for (let i = 0; i < size; i++) out[i] = args.length === 1 ? fn(sa ? a : a[i]) : fn(sa ? a : a[i], sb ? b : b[i]);
  return out;
}
const OPERATIONS = {'+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y, '/': (x, y) => x / y, '^': (x, y) => x ** y};

export function evaluate(ast, context, grid = null) {
  const size = grid?.size || 1;
  if (ast.type === 'number') return ast.value;
  if (ast.type === 'variable') return ast.name === 'pi' ? Math.PI : ast.name === 'e' ? Math.E : context[ast.name];
  if (ast.type === 'unary') return mapValues([evaluate(ast.child, context, grid)], x => ast.op === '-' ? -x : x, size);
  if (ast.type === 'binary') {
    const a = evaluate(ast.left, context, grid), b = evaluate(ast.right, context, grid);
    return mapValues([a, b], OPERATIONS[ast.op], size);
  }
  if (DERIVATIVES.has(ast.name)) {
    if (!grid) throw Error('Spatial derivatives are not allowed here.');
    const a = evaluate(ast.args[0], context, grid);
    if (typeof a === 'number') return 0;
    return grid.derivative(a, ast.name, ast.args[1]?.value, ast.args[0], context);
  }
  return mapValues(ast.args.map(arg => evaluate(arg, context, grid)), FUNCTIONS.get(ast.name)[1], size);
}

export function parseParameters(source = '') {
  if (typeof source !== 'string' || source.length > 2000) throw Error('Parameters must be a short list of named constants.');
  const result = Object.create(null);
  for (const entry of source.split(/[;\n]/).map(s => s.trim()).filter(Boolean)) {
    const match = entry.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!match || RESERVED.has(match[1]) || match[1].length > 24 || Object.hasOwn(result, match[1])) throw Error(`Invalid or repeated parameter: ${entry}. Use names such as nu or alpha; u, x, t and Lx are reserved.`);
    if (Object.keys(result).length >= 24) throw Error('Use at most 24 parameters.');
    const ast = parseExpression(match[2], Object.keys(result));
    const value = evaluate(ast, result);
    if (!Number.isFinite(value)) throw Error(`Parameter ${match[1]} must be finite.`);
    result[match[1]] = value;
  }
  return result;
}

function constant(ast, context) {
  if (ast.type === 'variable' && !['pi', 'e'].includes(ast.name) && !Object.hasOwn(context, ast.name)) return null;
  if (ast.type === 'unary' && constant(ast.child, context) === null) return null;
  if (ast.type === 'binary' && (constant(ast.left, context) === null || constant(ast.right, context) === null)) return null;
  if (ast.type === 'call' && (DERIVATIVES.has(ast.name) || ast.args.some(a => constant(a, context) === null))) return null;
  const value = evaluate(ast, context);
  return Number.isFinite(value) ? value : null;
}

// Fourier monomials: coefficient * (ikx)^px * (iky)^py.
export function splitLinear(ast, field, constants, dimension) {
  const scale = (terms, s) => terms.map(([px, py, c]) => [px, py, c * s]);
  function linear(node) {
    if (node.type === 'number' && node.value === 0) return [];
    if (node.type === 'variable' && node.name === field) return [[0, 0, 1]];
    if (node.type === 'unary') { const a = linear(node.child); return a && scale(a, node.op === '-' ? -1 : 1); }
    if (node.type === 'binary') {
      if (node.op === '+' || node.op === '-') { const a = linear(node.left), b = linear(node.right); return a && b && [...a, ...scale(b, node.op === '-' ? -1 : 1)]; }
      const a = constant(node.left, constants), b = constant(node.right, constants);
      if (node.op === '*' && a !== null) { const terms = linear(node.right); return terms && scale(terms, a); }
      if (node.op === '*' && b !== null) { const terms = linear(node.left); return terms && scale(terms, b); }
      if (node.op === '/' && b !== null && b !== 0) { const terms = linear(node.left); return terms && scale(terms, 1 / b); }
    }
    if (node.type === 'call' && DERIVATIVES.has(node.name)) {
      const a = linear(node.args[0]); if (!a) return null;
      const shift = (px, py) => a.map(([x, y, c]) => [x + px, y + py, c]);
      if (node.name === 'lap') return dimension === 2 ? [...shift(2, 0), ...shift(0, 2)] : shift(2, 0);
      if (node.name === 'biharm') return dimension === 2 ? [...shift(4, 0), ...scale(shift(2, 2), 2), ...shift(0, 4)] : shift(4, 0);
      return node.name === 'Dy' ? shift(0, node.args[1].value) : shift(node.args[1].value, 0);
    }
    return null;
  }
  function split(node) {
    const terms = linear(node); if (terms) return {terms, remainder: num(0)};
    if (node.type === 'binary' && (node.op === '+' || node.op === '-')) {
      const a = split(node.left), b = split(node.right);
      return {terms: [...a.terms, ...scale(b.terms, node.op === '-' ? -1 : 1)], remainder: binary(node.op, a.remainder, b.remainder)};
    }
    if (node.type === 'unary') { const a = split(node.child); return {terms: scale(a.terms, node.op === '-' ? -1 : 1), remainder: {...node, child: a.remainder}}; }
    if (node.type === 'binary' && ['*', '/'].includes(node.op)) {
      const a = constant(node.left, constants), b = constant(node.right, constants);
      const s = node.op === '*' ? a !== null ? a : b : b !== null && b !== 0 ? 1 / b : null;
      if (s !== null) {
        const inner = split(node.op === '*' && a !== null ? node.right : node.left);
        return {terms: scale(inner.terms, s), remainder: binary('*', num(s), inner.remainder)};
      }
    }
    return {terms: [], remainder: node};
  }
  return split(ast);
}
