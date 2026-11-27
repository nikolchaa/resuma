import { toast } from "sonner";
import { CircleCheck, CircleAlert, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const showSuccess = (title: string, description?: string) => {
  toast(
    <div className='flex items-center gap-2 select-none'>
      <CircleCheck className='w-5 h-5 text-primary shrink-0' />
      <div>
        <p className='text-sm text-primary'>{title}</p>
        {description && (
          <p className='text-sm text-muted-foreground font-[400]'>
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

export const showWarning = (title: string, description?: string) => {
  toast(
    <div className='flex items-center gap-2 select-none'>
      <CircleAlert className='w-5 h-5 text-yellow-500 shrink-0' />
      <div>
        <p className='text-sm text-yellow-500'>{title}</p>
        {description && (
          <p className='text-sm text-muted-foreground font-[400]'>
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

export const showError = (title: string, description?: string) => {
  toast(
    <div className='flex items-center gap-2 select-none'>
      <CircleX className='w-5 h-5 text-destructive shrink-0' />
      <div>
        <p className='text-sm text-destructive'>{title}</p>
        {description && (
          <p className='text-sm text-muted-foreground font-[400]'>
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * A newer release is out. Stays up longer than other toasts, and the link
 * opens in the system browser (the opener plugin handles target=_blank).
 */
export const showUpdateAvailable = ({
  title,
  description,
  action,
  url,
}: {
  title: string;
  description: string;
  action: string;
  url: string;
}) => {
  toast(
    <div className='flex items-start gap-2 select-none'>
      <CircleAlert className='w-5 h-5 text-yellow-500 shrink-0' />
      <div className='flex flex-col gap-1'>
        <p className='text-sm text-yellow-500'>{title}</p>
        <p className='text-sm text-muted-foreground font-[400]'>{description}</p>
        <Button asChild variant='outline' size='sm' className='self-start mt-1'>
          <a href={url} target='_blank' rel='noopener noreferrer'>
            {action}
          </a>
        </Button>
      </div>
    </div>,
    { duration: 15000 }
  );
};
