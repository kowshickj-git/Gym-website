'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/misc';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/submit-button';
import {
  deleteCategory,
  deletePlan,
  saveCategory,
  savePlan,
  setPlanActive,
  type CatalogueState,
} from '@/app/(admin)/admin/plans/actions';
import { formatCurrency } from '@/lib/utils';
import type { MembershipCategory, MembershipPlan } from '@/types/database';

/**
 * Plans and pricing.
 *
 * Everything the owner needs to run the business without touching the database:
 * change a price, add a new duration, retire a plan, add a whole new category.
 */
export function PlanManager({
  categories,
  plans,
}: {
  categories: MembershipCategory[];
  plans: MembershipPlan[];
}) {
  const [planDialog, setPlanDialog] = useState<{ open: boolean; plan?: MembershipPlan; categoryId?: string }>({
    open: false,
  });
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category?: MembershipCategory }>({
    open: false,
  });
  const [pending, startTransition] = useTransition();

  function toggle(plan: MembershipPlan) {
    startTransition(async () => {
      const result = await setPlanActive(plan.id, !plan.is_active);
      if (result.error) toast.error(result.error);
      else toast.success(plan.is_active ? `${plan.name} hidden from the plans page.` : `${plan.name} is live.`);
    });
  }

  function removePlan(plan: MembershipPlan) {
    startTransition(async () => {
      const result = await deletePlan(plan.id);
      if (result.error) toast.error(result.error, { duration: 8000 });
      else toast.success('Plan deleted.');
    });
  }

  function removeCategory(category: MembershipCategory) {
    startTransition(async () => {
      const result = await deleteCategory(category.id);
      if (result.error) toast.error(result.error, { duration: 8000 });
      else toast.success('Category deleted.');
    });
  }

  return (
    <div className="space-y-6">
      {categories.map((category) => {
        const categoryPlans = plans
          .filter((plan) => plan.category_id === category.id)
          .sort((a, b) => a.duration_months - b.duration_months);

        return (
          <section key={category.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{category.name}</h2>
                  {!category.is_active ? <Badge variant="muted">Hidden</Badge> : null}
                </div>
                {category.description ? (
                  <p className="text-muted-foreground text-sm text-pretty">{category.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${category.name}`}
                  onClick={() => setCategoryDialog({ open: true, category })}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${category.name}`}
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => removeCategory(category)}
                >
                  <Trash2 aria-hidden />
                </Button>
                <Button size="sm" onClick={() => setPlanDialog({ open: true, categoryId: category.id })}>
                  <Plus aria-hidden />
                  Add plan
                </Button>
              </div>
            </div>

            {categoryPlans.length === 0 ? (
              <Card className="py-6">
                <p className="text-muted-foreground px-5 text-sm">
                  No plans in this category yet. Add one to start selling it.
                </p>
              </Card>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {categoryPlans.map((plan) => (
                  <Card key={plan.id} className="gap-3 py-4">
                    <div className="flex items-start justify-between gap-2 px-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{plan.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {plan.duration_months} {plan.duration_months === 1 ? 'month' : 'months'}
                        </p>
                      </div>
                      {plan.highlight ? <Badge variant="secondary">{plan.highlight}</Badge> : null}
                    </div>

                    <p className="tnum px-4 text-2xl font-bold">{formatCurrency(Number(plan.base_price))}</p>

                    <div className="flex items-center justify-between gap-2 px-4">
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={plan.is_active}
                          onCheckedChange={() => toggle(plan)}
                          disabled={pending}
                          aria-label={`${plan.is_active ? 'Hide' : 'Show'} ${plan.name}`}
                        />
                        {plan.is_active ? 'Live' : 'Hidden'}
                      </label>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${plan.name}`}
                          onClick={() => setPlanDialog({ open: true, plan })}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          aria-label={`Delete ${plan.name}`}
                          disabled={pending}
                          onClick={() => removePlan(plan)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <Button variant="outline" size="lg" className="w-full" onClick={() => setCategoryDialog({ open: true })}>
        <Plus aria-hidden />
        Add a membership category
      </Button>

      <PlanDialog
        key={planDialog.plan?.id ?? planDialog.categoryId ?? 'new-plan'}
        state={planDialog}
        categories={categories}
        onClose={() => setPlanDialog({ open: false })}
      />

      <CategoryDialog
        key={categoryDialog.category?.id ?? 'new-category'}
        state={categoryDialog}
        onClose={() => setCategoryDialog({ open: false })}
      />
    </div>
  );
}

function PlanDialog({
  state,
  categories,
  onClose,
}: {
  state: { open: boolean; plan?: MembershipPlan; categoryId?: string };
  categories: MembershipCategory[];
  onClose: () => void;
}) {
  const [formState, formAction] = useActionState<CatalogueState, FormData>(savePlan, {});
  const plan = state.plan;

  useEffect(() => {
    if (formState.success) {
      toast.success('Plan saved.');
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.success]);

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : 'Add a plan'}</DialogTitle>
          <DialogDescription>
            The price here is what members see and pay. Changing it does not affect memberships already sold.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {plan ? <input type="hidden" name="id" value={plan.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="plan-category">Category</Label>
            <select
              id="plan-category"
              name="category_id"
              required
              defaultValue={plan?.category_id ?? state.categoryId ?? ''}
              className="border-input h-11 w-full rounded-lg border bg-transparent px-3 text-base md:text-sm"
            >
              <option value="" disabled>
                Choose a category
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Plan name</Label>
              <Input id="plan-name" name="name" defaultValue={plan?.name ?? ''} placeholder="e.g. 6 Months" required />
              {formState.fieldErrors?.name ? (
                <p className="text-destructive text-xs">{formState.fieldErrors.name}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-duration">Length (months)</Label>
              <Input
                id="plan-duration"
                name="duration_months"
                type="number"
                min={1}
                max={60}
                inputMode="numeric"
                defaultValue={plan?.duration_months ?? 1}
                required
              />
              {formState.fieldErrors?.duration_months ? (
                <p className="text-destructive text-xs">{formState.fieldErrors.duration_months}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-price">Price (₹)</Label>
              <Input
                id="plan-price"
                name="base_price"
                type="number"
                min={0}
                step={1}
                inputMode="decimal"
                defaultValue={plan?.base_price ?? ''}
                required
              />
              {formState.fieldErrors?.base_price ? (
                <p className="text-destructive text-xs">{formState.fieldErrors.base_price}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-highlight">Ribbon</Label>
              <Input
                id="plan-highlight"
                name="highlight"
                defaultValue={plan?.highlight ?? ''}
                placeholder="e.g. Popular"
                maxLength={40}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              name="description"
              rows={2}
              defaultValue={plan?.description ?? ''}
              placeholder="What this plan includes."
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <Label htmlFor="plan-active">Show on the plans page</Label>
            <Switch id="plan-active" name="is_active" defaultChecked={plan?.is_active ?? true} />
          </div>

          <input type="hidden" name="sort_order" value={plan?.sort_order ?? 0} />

          {formState.error ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden />
              <AlertDescription>{formState.error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save plan</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  state,
  onClose,
}: {
  state: { open: boolean; category?: MembershipCategory };
  onClose: () => void;
}) {
  const [formState, formAction] = useActionState<CatalogueState, FormData>(saveCategory, {});
  const category = state.category;

  useEffect(() => {
    if (formState.success) {
      toast.success('Category saved.');
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.success]);

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? `Edit ${category.name}` : 'Add a category'}</DialogTitle>
          <DialogDescription>
            A category is a way of training — cardio plus weights, weights only, or anything you add later such as
            personal training.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {category ? <input type="hidden" name="id" value={category.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              name="name"
              defaultValue={category?.name ?? ''}
              placeholder="e.g. Personal Training"
              required
            />
            {formState.fieldErrors?.name ? (
              <p className="text-destructive text-xs">{formState.fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-slug">URL slug</Label>
            <Input
              id="category-slug"
              name="slug"
              defaultValue={category?.slug ?? ''}
              placeholder="Leave blank to generate from the name"
            />
            {formState.fieldErrors?.slug ? (
              <p className="text-destructive text-xs">{formState.fieldErrors.slug}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-description">Description</Label>
            <Textarea
              id="category-description"
              name="description"
              rows={2}
              defaultValue={category?.description ?? ''}
              placeholder="What members get with this category."
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <Label htmlFor="category-active">Show on the plans page</Label>
            <Switch id="category-active" name="is_active" defaultChecked={category?.is_active ?? true} />
          </div>

          <input type="hidden" name="sort_order" value={category?.sort_order ?? 0} />

          {formState.error ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden />
              <AlertDescription>{formState.error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save category</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
