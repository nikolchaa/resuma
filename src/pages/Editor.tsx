import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Editor = () => {
  return (
    <div className='flex h-screen w-full flex-col items-center justify-center gap-4'>
      <Card className='glex flex-col items-center justify-center p-4 gap-4'>
        <h1>This is a Tauri (Rust + React TSX) LLM UI</h1>
        <div className='flex gap-2'>
          <Input
            type='text'
            className='w-[400px]'
            placeholder='Your Prompt Here'
          />
          <Button className='cursor-pointer'>Say something!</Button>
        </div>
      </Card>
      <p>Editor</p>
    </div>
  );
};
