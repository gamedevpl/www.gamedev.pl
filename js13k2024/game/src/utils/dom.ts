/**
 * Utility functions for DOM manipulation and event handling
 */

/**
 * Creates an HTML element with the given tag name
 * @param tagName - The tag name of the element to create
 * @returns The created HTML element
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
  return document.createElement(tagName);
}

/**
 * Adds an event listener to an element
 * @param element - The element to add the event listener to
 * @param eventType - The type of event to listen for
 * @param handler - The function to call when the event occurs
 */
export function addEventHandler<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  eventType: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void {
  element.addEventListener(eventType, handler);
}

/**
 *
 * @param eventType
 * @param handler
 */
export function addWindowEventHandler<K extends keyof GlobalEventHandlersEventMap>(
  eventType: K,
  handler: (event: GlobalEventHandlersEventMap[K]) => void,
): void {
  window.addEventListener(eventType, handler);
}

/**
 *
 * @param eventType
 * @param handler
 */
export function removeWindowEventHandler<K extends keyof GlobalEventHandlersEventMap>(
  eventType: K,
  handler: (event: GlobalEventHandlersEventMap[K]) => void,
): void {
  window.removeEventListener(eventType, handler);
}

/**
 * Removes all child nodes from an element
 * @param element - The element to clear
 */
export function clearElement(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Creates a div element with the given class name
 * @param className - The class name to apply to the div
 * @returns The created div element
 */
export function createDiv(className?: string): HTMLDivElement {
  const div = createElement('div');
  if (className) {
    div.className = className;
  }
  return div;
}
