import { SettingsButton } from "@/components/Settings";
import Logo from "../assets/Logo.svg?react";
import { Link } from "react-router-dom";

export const Home = () => {
  return (
    <div className='flex h-screen w-full flex-col items-center gap-4'>
      <Logo className='h-20 mt-36' />
      <Link to='/onboarding'>Onboard</Link>
      <SettingsButton />
    </div>
  );
};
