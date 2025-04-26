import LogoSplit from "@/components/LogoSplit";
import { useNavigate } from "react-router-dom";
import { motion as m } from "framer-motion";

const Welcome = () => {
  const navigate = useNavigate();

  return (
    <>
      <m.div
        className='fixed left-[50vw] translate-x-[-50%]'
        initial={{ width: "86vw", bottom: "0vh", translateY: "-7vw" }}
        animate={{ width: "31.351875rem", bottom: "50vh", translateY: "0" }}
        transition={{ duration: 0.4, delay: 1, ease: [0.2, 0, 0.3, 1] }}
      >
        <LogoSplit className={"overflow-visible"} />
      </m.div>
      <m.div
        className='fixed top-[calc(50vh+2rem)] cursor-pointer text-xl font-medium rounded-2xl px-4 py-2 shadow-sm hover:top-[calc(50vh+1.9rem)] ease-[cubic-bezier(.2,0,.3,1)] transition-[top] duration-100 bg-primary text-primary-foreground'
        onClick={() => navigate("step1")}
        initial={{ opacity: 0, translateY: "1rem" }}
        animate={{ opacity: 1, translateY: "0" }}
        transition={{ duration: 0.4, delay: 1.4 }}
      >
        Get Started!
      </m.div>
    </>
  );
};

export default Welcome;
