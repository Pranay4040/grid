"use client";

import { StatTile } from "@/components/panel";
import { GpaTable } from "@/components/gpa-table";
import { useGpaEstimates } from "@/lib/gpa/estimate-store";
import { estimateSemester } from "@/lib/academia/gpa";
import type { Course, SubjectMarks } from "@/lib/academia/data-types";

export function GpaBoard({ courses, marks }: { courses: Course[]; marks: SubjectMarks[] }) {
  const { estimates, setInternal, setExternal, clearAll } = useGpaEstimates();
  const result = estimateSemester(courses, marks, estimates);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <StatTile
          label="SGPA"
          value={result.sgpa == null ? "—" : result.sgpa.toFixed(2)}
          hint={`${result.estimatedCount} of ${result.totalCount} subjects estimated`}
          tone={result.sgpa == null ? "neutral" : "accent"}
        />
        <StatTile
          label="Credits estimated"
          value={`${result.estimatedCredits}/${result.totalCredits}`}
          hint={
            result.totalCount > 0 && result.estimatedCount === result.totalCount
              ? "All subjects estimated"
              : "In progress"
          }
          tone="neutral"
        />
      </div>
      <GpaTable
        subjects={result.subjects}
        onSetInternal={setInternal}
        onSetExternal={setExternal}
      />
      {result.estimatedCount > 0 ? (
        <button
          type="button"
          onClick={clearAll}
          className="self-start text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Clear estimates
        </button>
      ) : null}
    </>
  );
}
