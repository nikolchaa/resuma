import { useEffect, useMemo, useState } from "react";
import { SettingsButton } from "@/components/Settings";
import Logo from "../assets/Logo.svg?react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { listResumes, ResumeData } from "@/lib/resumesStore";

export const Home = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [resumes, setResumes] = useState<ResumeData[]>([]);

  useEffect(() => {
    listResumes().then(setResumes);
  }, []);

  const filteredAndSorted = useMemo(() => {
    const filtered = resumes.filter((res) =>
      res.title.toLowerCase().includes(query.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "recent":
          return new Date(b.updated).getTime() - new Date(a.updated).getTime();
        case "oldest":
          return new Date(a.updated).getTime() - new Date(b.updated).getTime();
        case "a-z":
          return a.title.localeCompare(b.title);
        case "z-a":
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });
  }, [query, sort, resumes]);

  return (
    <>
      <div className='flex w-full flex-col items-center mt-36 mb-36'>
        <Logo className='h-20' />
      </div>

      {/* Search, Sort, Add */}
      <div className='flex flex-wrap items-center justify-between gap-4 max-w-[50rem] mx-auto mb-4'>
        <Input
          placeholder='Search resumes...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className='flex-2'
        />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className='w-48'>
            <SelectValue placeholder='Sort by' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='recent'>Most Recent</SelectItem>
            <SelectItem value='oldest'>Oldest</SelectItem>
            <SelectItem value='a-z'>Name A–Z</SelectItem>
            <SelectItem value='z-a'>Name Z–A</SelectItem>
          </SelectContent>
        </Select>
        <Button asChild>
          <Button onClick={() => navigate("/new")}>
            <Plus className='mr-2 h-4 w-4' /> New Resume
          </Button>
        </Button>
      </div>

      {/* Resume cards grid */}
      <div className='grid grid-cols-4 max-w-[75rem] w-[calc(100vw-12.5rem)] gap-4 mx-auto'>
        {filteredAndSorted.length > 0 ? (
          filteredAndSorted.map((res) => (
            <Card key={res.id} className='w-full overflow-hidden'>
              <Link
                to={`/editor/${res.id}`}
                className='flex flex-col hover:shadow-lg transition h-full'
              >
                <div className='px-6 pb-6'>
                  <img
                    src={res.image}
                    alt={res.title}
                    className='w-full object-cover rounded-sm aspect-[1/1.4142]'
                  />
                </div>
                <CardHeader className='mt-auto'>
                  <CardTitle className='truncate'>{res.title}</CardTitle>
                  <CardDescription className='truncate'>
                    Last updated:{" "}
                    {new Date(res.updated).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>
          ))
        ) : (
          <div className='col-span-4 text-center'>
            <p className='text-muted-foreground'>
              No resumes found. Create a new one!
            </p>
          </div>
        )}
      </div>

      <SettingsButton />
    </>
  );
};
