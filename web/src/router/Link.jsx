import { pathFor, navigateTo } from "./router.js";

// An in-app link: a real anchor (so middle-click, "open in new tab" and copy-link
// work) that navigates without a page load on a plain left click.
export function Link({ to, params, replace, state, onClick, children, ...rest }) {
  const href = pathFor(to, params);
  const handle = (e) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target && rest.target !== "_self") return;
    e.preventDefault();
    navigateTo(href, { replace, state });
  };
  return <a href={href} onClick={handle} {...rest}>{children}</a>;
}
