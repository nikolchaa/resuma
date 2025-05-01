import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type Props = {
  value: { from: string; to?: string };
  onChange: (value: { from: string; to?: string }) => void;
};

export default function DateRangeDropdown({ value, onChange }: Props) {
  const [fromMonth, setFromMonth] = useState("");
  const [fromYear, setFromYear] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [toYear, setToYear] = useState("");
  const [ongoing, setOngoing] = useState(false);

  // Initialize only once on mount
  useEffect(() => {
    const parse = (str?: string) => {
      if (!str) return { month: "", year: "" };
      const [month, year] = str.split(" ");
      return { month, year };
    };

    const fromParsed = parse(value.from);
    const toParsed = parse(value.to);

    setFromMonth(fromParsed.month);
    setFromYear(fromParsed.year);
    setToMonth(toParsed.month);
    setToYear(toParsed.year);
    setOngoing(!value.to);
  }, []);

  // Emit changes upward whenever inputs change
  useEffect(() => {
    if (!fromMonth || !fromYear) return;

    const from = `${fromMonth} ${fromYear}`;
    const to =
      ongoing || !toMonth || !toYear ? undefined : `${toMonth} ${toYear}`;

    onChange({ from, to });
  }, [fromMonth, fromYear, toMonth, toYear, ongoing]);

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex gap-4'>
        <div className='flex flex-1 flex-col gap-2'>
          <Label>
            From<span className='text-destructive'>*</span>
          </Label>
          <div className='flex gap-4'>
            <Select value={fromMonth} onValueChange={setFromMonth}>
              <SelectTrigger className='w-1/2'>
                <SelectValue placeholder='Month' />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type='number'
              placeholder='2020'
              value={fromYear}
              onChange={(e) => setFromYear(e.target.value)}
              className='w-1/2'
            />
          </div>
        </div>

        <div className='flex flex-1 flex-col gap-2'>
          <Label>To</Label>
          <div className='flex gap-4'>
            <Select
              value={toMonth}
              onValueChange={setToMonth}
              disabled={ongoing}
            >
              <SelectTrigger className='w-1/2'>
                <SelectValue placeholder='Month' />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type='number'
              placeholder='2024'
              value={toYear}
              onChange={(e) => setToYear(e.target.value)}
              className='w-1/2'
              disabled={ongoing}
            />
          </div>
        </div>
      </div>

      <div className='flex items-center justify-between'>
        <Label>Ongoing</Label>
        <Switch checked={ongoing} onCheckedChange={setOngoing} />
      </div>
    </div>
  );
}
