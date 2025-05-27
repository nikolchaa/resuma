import { toast } from "sonner";
import { CircleCheck, CircleAlert, CircleX } from "lucide-react";

export const showSuccess = (title: string, description?: string) => {
  toast(
    <div className='flex items-center gap-2'>
      <CircleCheck className='w-5 h-5 text-primary' />
      <div>
        <p className='text-primary'>{title}</p>
        {description && (
          <p className='text-sm text-muted-foreground'>{description}</p>
        )}
      </div>
    </div>
  );
};

export const showWarning = (title: string, description?: string) => {
  toast(
    <div className='flex items-center gap-2'>
      <CircleAlert className='w-5 h-5 text-yellow-500' />
      <div>
        <p className='text-yellow-500'>{title}</p>
        {description && (
          <p className='text-sm text-muted-foreground'>{description}</p>
        )}
      </div>
    </div>
  );
};

export const showError = (title: string, description?: string) => {
  toast(
    <div className='flex items-center gap-2'>
      <CircleX className='w-5 h-5 text-destructive' />
      <div>
        <p className='text-destructive'>{title}</p>
        {description && (
          <p className='text-sm text-muted-foreground'>{description}</p>
        )}
      </div>
    </div>
  );
};
