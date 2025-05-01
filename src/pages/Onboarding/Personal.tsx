import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOnboarding } from "@/contexts/OnboardingContext";

const Personal = () => {
  const navigate = useNavigate();
  const { state, update, apply } = useOnboarding();

  const isValid =
    state.personal.fullName.trim() !== "" &&
    state.personal.email.trim() !== "" &&
    state.personal.location.trim() !== "" &&
    state.personal.headline.trim() !== "";

  return (
    <Card className='w-full max-w-lg mx-auto'>
      <CardHeader>
        <CardTitle className='text-2xl font-semibold'>Personal Info</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          Add your personal details. These will be displayed at the top of your
          resume.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Label>
            Full Name<span className='text-destructive'>*</span>
          </Label>
          <Input
            value={state.personal.fullName}
            onChange={(e) => update("personal", { fullName: e.target.value })}
            placeholder='John Doe'
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label>
            Email<span className='text-destructive'>*</span>
          </Label>
          <Input
            type='email'
            value={state.personal.email}
            onChange={(e) => update("personal", { email: e.target.value })}
            placeholder='yourname@mail.com'
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label>
            Location<span className='text-destructive'>*</span>
          </Label>
          <Input
            value={state.personal.location}
            onChange={(e) => update("personal", { location: e.target.value })}
            placeholder='San Francisco, CA'
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label>
            Headline<span className='text-destructive'>*</span>
          </Label>
          <Input
            value={state.personal.headline}
            onChange={(e) => update("personal", { headline: e.target.value })}
            placeholder='Frontend Developer, UX Designer...'
          />
        </div>
        <div className='flex justify-end mt-4'>
          <Button
            disabled={!isValid}
            onClick={() =>
              apply("personal").then(() => navigate("/onboarding/step4"))
            }
          >
            Continue <ArrowRight className='h-4 ml-1' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Personal;
