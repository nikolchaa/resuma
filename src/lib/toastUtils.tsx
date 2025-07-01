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

export const showUpdateAvailable = (version: string) => {
  toast(
    <div className='flex items-start gap-3 select-none'>
      <CircleAlert className='w-5 h-5 text-yellow-500 mt-1 shrink-0' />
      <div className='flex flex-col'>
        <p className='text-sm text-yellow-500'>Update available: v{version}</p>
        <p className='text-sm text-muted-foreground font-[400]'>
          A new version of Resuma is available. Click below to view it.
        </p>
        <Button
          variant={"outline"}
          size={"sm"}
          onClick={() => open("https://github.com/nikolchaa/resuma/releases")}
          className='self-start mt-1'
        >
          View Release
        </Button>
      </div>
    </div>
  );
};
