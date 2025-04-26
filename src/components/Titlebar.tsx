// components/Titlebar.tsx
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Minus, Square } from "lucide-react";

const appWindow = getCurrentWindow();

const Titlebar = () => {
  return (
    <div
      className='titlebar flex items-center justify-end h-8 select-none text-foreground fixed top-0 left-0 right-0 z-50'
      data-tauri-drag-region
    >
      <button
        className='group cursor-pointer hover:bg-primary p-2'
        onClick={() => appWindow.minimize()}
      >
        <Minus
          strokeWidth={"1.5px"}
          className='w-4 h-4 group-hover:stroke-primary-foreground'
        />
      </button>
      <button
        className='group cursor-pointer hover:bg-primary p-2'
        onClick={() => appWindow.toggleMaximize()}
      >
        <Square
          strokeWidth={"2px"}
          className='w-4 h-4 scale-75 group-hover:stroke-primary-foreground'
        />
      </button>
      <button
        className='group cursor-pointer hover:bg-primary p-2'
        onClick={() => appWindow.close()}
      >
        <X
          strokeWidth={"1.5px"}
          className='w-4 h-4 group-hover:stroke-primary-foreground'
        />
      </button>
    </div>
  );
};

export default Titlebar;
