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
 * Sets multiple attributes on an HTML element
 * @param element - The element to set attributes on
 * @param attributes - An object containing attribute key-value pairs
 */
export function setAttributes(element: HTMLElement, attributes: Record<string, string>): void {
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
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
 * Updates the text content of an element
 * @param element - The element to update
 * @param text - The new text content
 */
export function updateText(element: HTMLElement, text: string): void {
  element.textContent = text;
}

/**
 * Creates a button element with text and click handler
 * @param text - The text content of the button
 * @param onClick - The function to call when the button is clicked
 * @returns The created button element
 */
export function createButton(text: string, onClick: () => void): HTMLButtonElement {
  const button = createElement('button');
  updateText(button, text);
  addEventHandler(button, 'click', onClick);
  return button;
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
 * Appends multiple child elements to a parent element
 * @param parent - The parent element
 * @param children - The child elements to append
 */
export function appendChildren(parent: HTMLElement, children: HTMLElement[]): void {
  children.forEach((child) => parent.appendChild(child));
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

/**
 * Sets the display style of an element
 * @param element - The element to update
 * @param display - The display value to set
 */
export function setDisplayStyle(element: HTMLElement, display: string): void {
  element.style.display = display;
}
