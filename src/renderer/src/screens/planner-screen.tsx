import { createContext, useContext, useEffect, useState, type ComponentProps, type FormEvent } from 'react';
import { es } from 'react-day-picker/locale';
import { todayKey, type PublicState } from '../../../shared/state/contract';
import { FIRST_PLANNED_DATE, LAST_PLANNED_DATE, type Task, type TaskSummary } from '../../../shared/tasks/contract';
import { Button } from '../components/ui/button';
import { Calendar, CalendarDayButton } from '../components/ui/calendar';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';
import { TaskList } from '../components/task-list';
import { calendarRange, completionText, dateLabel, dayButtonLabel, dayIndicator, dayToDate, monthOf, tasksRevision } from '../view';
import type { RunAction } from '../use-ritmo';

const FIRST_DAY = dayToDate(FIRST_PLANNED_DATE);
const LAST_DAY = dayToDate(LAST_PLANNED_DATE);

// El resumen llega por contexto: si `DayButton` dependiera de él, react-day-picker volvería a montar
// las celdas con cada resumen nuevo y el foco del teclado se perdería.
const SummaryContext = createContext<TaskSummary>({});

function PlannerDayButton({ children, ...props }: ComponentProps<typeof CalendarDayButton>) {
  const indicator = dayIndicator(useContext(SummaryContext)[todayKey(props.day.date)]);
  return <CalendarDayButton {...props} className={cn(props.className, 'planner-day')}>
    <span className="planner-day-number">{children}</span>
    {indicator && <span className="planner-day-tasks" data-complete={indicator.complete} aria-hidden="true">{indicator.text}</span>}
  </CalendarDayButton>;
}

// PlannerDayButton está fuera del render para que React vea siempre el mismo componente y no vuelva a
// montar las celdas. react-day-picker recalcula su configuración en cada render de todos modos.
const CALENDAR_COMPONENTS = { DayButton: PlannerDayButton };

interface PlannerScreenProps {
  state: PublicState;
  run: RunAction;
  showError: (error: unknown) => void;
  today: string;
  date: string;
  onDateChange: (date: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
}

export function PlannerScreen({ state, run, showError, today, date, onDateChange, title, onTitleChange }: PlannerScreenProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<TaskSummary>({});
  const [month, setMonth] = useState(() => monthOf(date));
  const [reload, setReload] = useState(0);
  const revision = tasksRevision(state);
  const { from, to } = calendarRange(month);

  // Las tareas de otros días no llegan en el estado: se piden al elegir el día o el mes y
  // después de cada cambio hecho aquí o en la lista de hoy.
  useEffect(() => {
    let active = true;
    window.ritmo.getTasksForDay(date).then(items => { if (active) setTasks(items); }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [date, revision, reload, showError]);

  useEffect(() => {
    let active = true;
    window.ritmo.getTaskSummary(from, to).then(items => { if (active) setSummary(items); }).catch(error => { if (active) { setSummary({}); showError(error); } });
    return () => { active = false; };
  }, [from, to, revision, reload, showError]);

  const runAndReload: RunAction = async work => {
    const ok = await run(work);
    setReload(count => count + 1);
    return ok;
  };

  async function add(event: FormEvent) {
    event.preventDefault();
    if (title.trim() && await runAndReload(() => window.ritmo.addTask(title, date))) onTitleChange('');
  }

  // El mes cambia solo por una acción del usuario: si siguiera a `date`, el calendario volvería
  // al mes actual a medianoche, cuando el día elegido por defecto pasa al siguiente.
  function select(day: Date) {
    onDateChange(todayKey(day));
    setMonth(monthOf(todayKey(day)));
  }

  function goToday() {
    onDateChange(today);
    setMonth(monthOf(today));
  }

  return <section className="planner-panel" aria-labelledby="planner-heading">
    <div className="planner-header">
      <div className="sheet-head"><h2 id="planner-heading">Planner</h2><p className="section-subtitle">Tus tareas permanecen en el día que elegiste hasta que las muevas.</p></div>
      <Button variant="outline" className="planner-today" onClick={goToday}>Hoy</Button>
    </div>
    <div className="planner-layout">
      <SummaryContext.Provider value={summary}>
        <Calendar
          className="planner-calendar"
          mode="single"
          required
          selected={dayToDate(date)}
          onSelect={select}
          month={month}
          onMonthChange={setMonth}
          startMonth={FIRST_DAY}
          endMonth={LAST_DAY}
          disabled={[{ before: FIRST_DAY }, { after: LAST_DAY }]}
          today={dayToDate(today)}
          locale={es}
          weekStartsOn={1}
          fixedWeeks
          labels={{ labelDayButton: (day, modifiers) => dayButtonLabel(todayKey(day), summary[todayKey(day)], modifiers.today) }}
          components={CALENDAR_COMPONENTS}
        />
      </SummaryContext.Provider>
      <div className="planner-day-panel" aria-labelledby="planner-day-heading" role="region">
        <div className="sheet-head"><h3 id="planner-day-heading" className="planner-day-heading">{dateLabel(date)}</h3><p className="section-subtitle">{completionText(tasks, 'Sin tareas planificadas.')}</p></div>
        <form className="inline-form planner-form" onSubmit={event => void add(event)}><label className="sr-only" htmlFor="planner-task-input">Nueva tarea para el día elegido</label><Input id="planner-task-input" value={title} onChange={event => onTitleChange(event.target.value)} maxLength={160} placeholder="Añadir tarea para este día…" autoComplete="off" /><Button type="submit">Añadir</Button></form>
        <TaskList tasks={tasks} planner run={runAndReload} />
        {tasks.length === 0 && <p className="empty-state">No hay tareas para este día.</p>}
      </div>
    </div>
  </section>;
}
