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
    state.personal.location.trim() !== "";

  return (
    <Card className='w-full max-w-lg mx-auto'>
      <CardHeader>
        <CardTitle className='text-2xl font-semibold'>Personal Info</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          Add your personal details. These will always be displayed on your
          resume.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {/* Full Name */}
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

        {/* Email */}
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

        {/* Location */}
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

        {/* Phone */}
        <div className='flex flex-col gap-2'>
          <Label>Phone</Label>
          <Input
            value={state.personal.phone || ""}
            onChange={(e) => update("personal", { phone: e.target.value })}
            placeholder='+381 60 123 4567'
          />
        </div>

        {/* LinkedIn */}
        <div className='flex flex-col gap-2'>
          <Label>LinkedIn</Label>
          <Input
            value={state.personal.linkedin || ""}
            onChange={(e) => update("personal", { linkedin: e.target.value })}
            placeholder='https://linkedin.com/in/username'
          />
        </div>

        {/* GitHub */}
        <div className='flex flex-col gap-2'>
          <Label>GitHub</Label>
          <Input
            value={state.personal.github || ""}
            onChange={(e) => update("personal", { github: e.target.value })}
            placeholder='https://github.com/username'
          />
        </div>

        {/* Website */}
        <div className='flex flex-col gap-2'>
          <Label>Website</Label>
          <Input
            value={state.personal.website || ""}
            onChange={(e) => update("personal", { website: e.target.value })}
            placeholder='https://yourwebsite.com'
          />
        </div>

        {/* Continue */}
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
