"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  date?: Date
  setDate: (date?: Date) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}

export function DatePicker({ 
  date, 
  setDate, 
  disabled = false, 
  className, 
  placeholder = "Pick a date" 
}: DatePickerProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "PPP") : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function DateRangePicker({ 
  startDate, 
  endDate, 
  onStartDateChange, 
  onEndDateChange, 
  disabled = false 
}: {
  startDate?: Date
  endDate?: Date
  onStartDateChange: (date?: Date) => void
  onEndDateChange: (date?: Date) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center space-x-2">
      <DatePicker 
        date={startDate} 
        setDate={onStartDateChange} 
        disabled={disabled} 
        placeholder="Start date"
      />
      <span className="text-muted-foreground">to</span>
      <DatePicker 
        date={endDate} 
        setDate={onEndDateChange} 
        disabled={disabled} 
        placeholder="End date"
      />
    </div>
  )
}
