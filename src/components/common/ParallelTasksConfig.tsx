import React from "react";
import Card from "./Card";
import Button from "./Button";

interface ParallelTasksConfigProps {
  parallelTasksCount: number;
  onUpdateParallelTasksCount: (value: number) => void;
  disabled?: boolean;
}

const ParallelTasksConfig: React.FC<ParallelTasksConfigProps> = ({
  parallelTasksCount,
  onUpdateParallelTasksCount,
  disabled = false,
}) => {
  const [localValue, setLocalValue] = React.useState(parallelTasksCount);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setLocalValue(parallelTasksCount);
  }, [parallelTasksCount]);

  const handleUpdateParallelTasksCount = async () => {
    setLoading(true);
    onUpdateParallelTasksCount(localValue);
    // Loading will be cleared when new props arrive
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <Card title="Parallel Tasks Configuration">
      <div className="parallel-tasks-config">
        <p className="text-sm opacity-80 mb-3">
          Configure the number of tasks that can run in parallel.
        </p>
        <div className="flex gap-2 items-center">
          <label htmlFor="parallel-tasks" className="text-sm font-medium">
            Parallel Tasks Count:
          </label>
          <select
            id="parallel-tasks"
            value={localValue}
            onChange={(e) => setLocalValue(Number(e.target.value))}
            disabled={disabled || loading}
            className="parallel-tasks-select"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={handleUpdateParallelTasksCount}
            disabled={disabled || loading || localValue === parallelTasksCount}
            loading={loading}
          >
            Update
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default React.memo(ParallelTasksConfig);
