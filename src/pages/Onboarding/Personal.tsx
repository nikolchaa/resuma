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
import { MinusCircle, PlusCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOnboarding } from "@/contexts/OnboardingContext";

const Personal = () => {
  const navigate = useNavigate();
  const { state, update, apply } = useOnboarding();

  const isValid =
    state.personal.fullName.trim() !== "" &&
    state.personal.email.trim() !== "" &&
    state.personal.location.trim() !== "";

  const socials = state.personal.socials ?? [];

  const updateSocials = (index: number, value: string) => {
    const updated = [...socials];
    updated[index] = value;
    update("personal", { socials: updated });
  };

  const addSocial = () => {
    update("personal", { socials: [...socials, ""] });
  };

  const removeSocial = (index: number) => {
    const updated = [...socials];
    updated.splice(index, 1);
    update("personal", { socials: updated });
  };

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

        {/* Links */}
        <div className='flex flex-col gap-2'>
          <Label>
            Links <span className='text-muted-foreground'>(optional)</span>
          </Label>
          {socials.map((link, index) => (
            <div key={index} className='flex gap-2'>
              <Input
                value={link}
                onChange={(e) => updateSocials(index, e.target.value)}
                placeholder='https://linkedin.com/in/something'
              />
              <Button
                variant='ghost'
                className='text-destructive'
                onClick={() => removeSocial(index)}
              >
                <MinusCircle className='h-4 w-4' />
              </Button>
            </div>
          ))}
          <Button
            variant='ghost'
            className='text-primary w-fit'
            onClick={addSocial}
          >
            <PlusCircle className='h-4 w-4 mr-1' />
            Add Links
          </Button>
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
