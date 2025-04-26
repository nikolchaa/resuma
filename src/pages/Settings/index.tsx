import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { AnimatePresence, motion as m } from "motion/react";

import { AppSettings } from "./AppSettings";
import { AISettings } from "./AISettings";
import { PersonalDetails } from "./PersonalDetails";

import { Back } from "@/components/Back";
import { useState } from "react";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("app");

  return (
    <>
      <Back location={"/"} />
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className='w-full flex flex-col items-center gap-8'
      >
        <TabsList className='bg-background border fixed shadow-sm top-8'>
          <TabsTrigger className='px-4 cursor-pointer' value='app'>
            App Settings
          </TabsTrigger>
          <TabsTrigger className='px-4 cursor-pointer' value='ai'>
            AI Settings
          </TabsTrigger>
          <TabsTrigger className='px-4 cursor-pointer' value='personal'>
            Personal Details
          </TabsTrigger>
        </TabsList>

        <div className='max-w-[75rem] w-[calc(100%-12rem)] mt-[6.25rem]'>
          <AnimatePresence mode='wait'>
            {activeTab === "app" && (
              <m.div
                key={"app-settings"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl'>App Settings</CardTitle>
                    <CardDescription className='text-[1rem]'>
                      Configure general app preferences
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AppSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "ai" && (
              <m.div
                key={"ai-settings"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl'>AI Settings</CardTitle>
                    <CardDescription className='text-[1rem]'>
                      Adjust AI model, temp, and behavior
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AISettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "personal" && (
              <m.div
                key={"personal-details"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl'>Personal Details</CardTitle>
                    <CardDescription className='text-[1rem]'>
                      Fill out info used across all resumes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PersonalDetails />
                  </CardContent>
                </Card>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </Tabs>
    </>
  );
}
