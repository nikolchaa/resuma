import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { AnimatePresence, motion as m } from "motion/react";

import { BasicSettings } from "./BasicSettings";
import { ArtificialSettings } from "./ArtificialSettings";
import { PersonalSettings } from "./PersonalSettings";
import { EducationSettings } from "./EducationSettings";
import { ExperienceSettings } from "./ExperienceSettings";
import { ProjectsSettings } from "./ProjectsSettings";
import { SkillsSettings } from "./SkillsSettings";
import { AwardsSettings } from "./AwardsSettings";

import { Back } from "@/components/Back";
import { useState } from "react";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("basic");

  return (
    <div className='flex w-full h-screen items-center justify-center'>
      <Back location='/' />
      <div className='flex max-w-[75rem] w-[calc(100vw-12.5rem)] h-screen gap-8'>
        {/* Left Vertical Tabs */}
        <div className='mt-8 sticky h-full'>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            orientation='vertical'
          >
            <TabsList className='flex flex-col gap-2 bg-background border shadow-sm p-2 h-full'>
              <TabsTrigger
                value='basic'
                className='px-4 py-2 w-48 justify-baseline'
              >
                App Settings
              </TabsTrigger>
              <TabsTrigger
                value='artificial'
                className='px-4 py-2 w-48 justify-baseline'
              >
                AI Settings
              </TabsTrigger>
              <TabsTrigger
                value='personal'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Personal Details
              </TabsTrigger>
              <TabsTrigger
                value='education'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Education
              </TabsTrigger>
              <TabsTrigger
                value='experience'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Experience
              </TabsTrigger>
              <TabsTrigger
                value='projects'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Projects
              </TabsTrigger>
              <TabsTrigger
                value='skills'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Skills
              </TabsTrigger>
              <TabsTrigger
                value='awards'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Awards
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Right Content Area */}
        <div className='flex-1 py-8 overflow-y-auto'>
          <AnimatePresence mode='wait'>
            {activeTab === "basic" && (
              <m.div
                key='basic-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      App Settings
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Configure your general app preferences. Import and export
                      your application settings.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BasicSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "artificial" && (
              <m.div
                key='artificial-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      AI Setup
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Adjust preferences for AI-powered resume generation,
                      including model selection, runtime options, and LLM
                      parameters.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ArtificialSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "personal" && (
              <m.div
                key='personal-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Personal Details
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Change your info used across all resumes. These will
                      always be displayed on your resume.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PersonalSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "education" && (
              <m.div
                key='education-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Education
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      List your educational background, including school,
                      degree, and relevant coursework.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EducationSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "experience" && (
              <m.div
                key='experience-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Experience
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Add your work history with key roles and accomplishments.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ExperienceSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "projects" && (
              <m.div
                key='projects-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Projects
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Show off your best work. Include side projects, open
                      source, or professional apps.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ProjectsSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "skills" && (
              <m.div
                key='skills-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Skills
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Add your professional and technical skills grouped by
                      category.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SkillsSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "awards" && (
              <m.div
                key='awards-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Awards
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Add any notable awards or recognitions you've received.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AwardsSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
