export abstract class BaseComponent {
    protected containerEl: HTMLElement;

    constructor(containerEl: HTMLElement) {
        this.containerEl = containerEl;
    }

    /**
     * Mount the component to the DOM.
     * This method calls render() and performs any necessary setup.
     */
    public mount(): void {
        this.render();
        this.onMount();
    }

    /**
     * Unmount the component from the DOM.
     * Use this to clean up event listeners or timers.
     */
    public unmount(): void {
        this.onUnmount();
        this.containerEl.empty();
    }

    /**
     * Update the component with new data and re-render.
     */
    public update(): void {
        this.containerEl.empty();
        this.render();
    }

    /**
     * Render the component's UI.
     * Should be implemented by subclasses.
     */
    protected abstract render(): void;

    /**
     * Optional lifecycle hook called after mounting.
     */
    protected onMount(): void { }

    /**
     * Optional lifecycle hook called before unmounting.
     */
    protected onUnmount(): void { }
}
