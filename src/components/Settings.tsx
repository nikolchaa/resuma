import { Settings } from "lucide-react";
import { Link } from "react-router-dom";

export const SettingsButton = () => {
  return (
    <Link
      to='/settings'
      className='group bg-background fixed bottom-8 right-8 z-40 border shadow-sm h-9 w-9 flex items-center justify-center rounded-lg hover:bg-primary dark:hover:bg-primary transition duration-200'
    >
      <Settings className='transition group-hover:dark:stroke-background duration-200 h-[calc(2.25rem-0.75rem)] w-[calc(2.25rem-0.75rem)]' />
    </Link>
  );
};
