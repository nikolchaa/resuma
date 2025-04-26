import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface BackProps {
  location: string;
}

export const Back: React.FC<BackProps> = ({ location }) => {
  return (
    <Link
      to={location}
      className='group bg-background fixed top-8 left-8 z-40 border shadow-sm h-9 w-9 flex items-center justify-center rounded-lg hover:bg-primary dark:hover:bg-primary transition duration-200'
    >
      <ArrowLeft className='group-hover:dark:stroke-background transition duration-200 h-[calc(2.25rem-0.75rem)] w-[calc(2.25rem-0.75rem)]' />
    </Link>
  );
};
