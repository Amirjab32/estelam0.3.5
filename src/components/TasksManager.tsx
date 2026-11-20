import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  Trash2,
  Plus,
  Tag,
  AlertCircle,
  Calendar,
  Check,
} from 'lucide-react';
import { getCurrentPersianDate, toPersianDigits } from '../utils/jalali.ts';

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  category: string;
  dateStr: string;
}

const STORAGE_KEY = 'fa_app_tasks_v1';

export const TasksManager: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    const today = getCurrentPersianDate();
    return [
      {
        id: '1',
        title: 'بررسی امکانات و ماژول‌های سامانه',
        completed: true,
        priority: 'high',
        category: 'کاری',
        dateStr: `${toPersianDigits(today.day)} ${today.monthName}`,
      },
      {
        id: '2',
        title: 'طراحی بخش‌های اختصاصی و افزودن فیچرهای جدید',
        completed: false,
        priority: 'high',
        category: 'توسعه',
        dateStr: `${toPersianDigits(today.day)} ${today.monthName}`,
      },
      {
        id: '3',
        title: 'تست تقویم و تبدیل تاریخ خورشیدی',
        completed: false,
        priority: 'medium',
        category: 'شخصی',
        dateStr: `${toPersianDigits(today.day)} ${today.monthName}`,
      },
    ];
  });

  const [inputTitle, setInputTitle] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [category, setCategory] = useState('کاری');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.error(e);
    }
  }, [tasks]);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputTitle.trim()) return;

    const today = getCurrentPersianDate();
    const newTask: TaskItem = {
      id: Date.now().toString(),
      title: inputTitle.trim(),
      completed: false,
      priority,
      category,
      dateStr: `${toPersianDigits(today.day)} ${today.monthName}`,
    };

    setTasks([newTask, ...tasks]);
    setInputTitle('');
  };

  const toggleTask = (id: string) => {
    setTasks(
      tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
  };

  const clearCompleted = () => {
    setTasks(tasks.filter((t) => !t.completed));
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const progressPercent = tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  const priorityLabels = {
    high: { label: 'فوری', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
    medium: { label: 'متوسط', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
    low: { label: 'عادی', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
  };

  return (
    <div className="space-y-6">
      {/* Top stats bar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>📋</span>
              <span>دفترچه یادداشت و مدیریت کارها</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              مدیریت روزانه با تاریخ‌های خورشیدی و ذخیره همیشگی در مرورگر شما
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              پیشرفت: {toPersianDigits(completedCount)} از {toPersianDigits(tasks.length)} ({toPersianDigits(progressPercent)}٪)
            </span>
            {completedCount > 0 && (
              <button
                onClick={clearCompleted}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
              >
                حذف انجام‌شده‌ها
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Add Task Form */}
      <form
        onSubmit={handleAddTask}
        className="rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 shadow-sm"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={inputTitle}
            onChange={(e) => setInputTitle(e.target.value)}
            placeholder="عنوان کار یا یادداشت جدید را بنویسید..."
            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <div className="flex items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="کاری">کاری</option>
              <option value="توسعه">توسعه</option>
              <option value="شخصی">شخصی</option>
              <option value="یادگیری">یادگیری</option>
              <option value="مالی">مالی</option>
            </select>

            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="high">فوری</option>
              <option value="medium">متوسط</option>
              <option value="low">عادی</option>
            </select>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm transition active:scale-95 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن</span>
            </button>
          </div>
        </div>
      </form>

      {/* Filter Tabs & Task List */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 pt-3 gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition ${
              filter === 'all'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            همه ({toPersianDigits(tasks.length)})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition ${
              filter === 'active'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            در حال انجام ({toPersianDigits(tasks.filter((t) => !t.completed).length)})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition ${
              filter === 'completed'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            انجام شده ({toPersianDigits(completedCount)})
          </button>
        </div>

        {/* Task Items */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              هیچ موردی در این بخش یافت نشد.
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div
                key={task.id}
                className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition group"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => toggleTask(task.id)}
                    className="text-slate-400 hover:text-indigo-600 transition flex-shrink-0"
                    aria-label={task.completed ? 'علامت به عنوان انجام نشده' : 'علامت به عنوان انجام شده'}
                  >
                    {task.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-400 dark:text-slate-600" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium truncate ${
                        task.completed
                          ? 'line-through text-slate-400 dark:text-slate-500'
                          : 'text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{task.dateStr}</span>
                      </span>
                      <span>•</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {task.category}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-medium ${
                          priorityLabels[task.priority].color
                        }`}
                      >
                        {priorityLabels[task.priority].label}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => deleteTask(task.id)}
                  aria-label="حذف یادداشت"
                  className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
