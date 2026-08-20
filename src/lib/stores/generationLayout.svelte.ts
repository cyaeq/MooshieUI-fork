export type GenerationLayoutStyle = "studio" | "focus";
export type GenerationControlsSide = "left" | "right";
export type MobilePanelControls = "quick" | "edge";

const STORAGE_KEY = "mooshieui.generationLayout.v1";

class GenerationLayoutStore {
  style = $state<GenerationLayoutStyle>("studio");
  controlsSide = $state<GenerationControlsSide>("left");
  mobilePanelControls = $state<MobilePanelControls>("quick");

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.style === "studio" || saved.style === "focus") this.style = saved.style;
      if (saved.controlsSide === "left" || saved.controlsSide === "right") this.controlsSide = saved.controlsSide;
      if (saved.mobilePanelControls === "quick" || saved.mobilePanelControls === "edge") {
        this.mobilePanelControls = saved.mobilePanelControls;
      }
    } catch (error) {
      console.warn("Failed to load generation layout:", error);
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        style: this.style,
        controlsSide: this.controlsSide,
        mobilePanelControls: this.mobilePanelControls,
      }));
    } catch (error) {
      console.warn("Failed to save generation layout:", error);
    }
  }

  setStyle(style: GenerationLayoutStyle) {
    this.style = style;
    this.save();
  }

  setControlsSide(side: GenerationControlsSide) {
    this.controlsSide = side;
    this.save();
  }

  setMobilePanelControls(style: MobilePanelControls) {
    this.mobilePanelControls = style;
    this.save();
  }
}

export const generationLayout = new GenerationLayoutStore();
