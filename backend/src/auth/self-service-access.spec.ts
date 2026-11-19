import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UserAddressController } from './user-address.controller.js';
import { CustomerManagementController } from './customer-management.controller.js';
import { CartController } from '../order/cart.controller.js';
import {
  CustomerOrdersController,
  AdminOrdersController,
} from '../order/order.controller.js';
import { RolesGuard } from '../shared/guards/roles.guard.js';
import { EngagementController } from '../catalog/engagement/engagement.controller.js';

const guard = new RolesGuard(new Reflector());

function allowed(
  controller: { prototype: object },
  method: string,
  role: 'ADMIN' | 'CUSTOMER',
) {
  const handler = Object.getOwnPropertyDescriptor(controller.prototype, method)
    ?.value as object;
  const context = {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ actor: { role } }) }),
  } as unknown as ExecutionContext;
  return guard.canActivate(context);
}

describe('self-service roles', () => {
  it.each([
    [UserAddressController, 'list'],
    [CustomerManagementController, 'updateProfile'],
    [CartController, 'get'],
    [CustomerOrdersController, 'place'],
    [EngagementController, 'wishlist'],
    [EngagementController, 'review'],
  ])(
    'allows both roles to use their own self-service routes',
    (controller, method) => {
      expect(allowed(controller, method, 'ADMIN')).toBe(true);
      expect(allowed(controller, method, 'CUSTOMER')).toBe(true);
    },
  );

  it('keeps admin order management restricted to admins', () => {
    expect(allowed(AdminOrdersController, 'list', 'ADMIN')).toBe(true);
    expect(allowed(AdminOrdersController, 'list', 'CUSTOMER')).toBe(false);
  });
  it('restricts review moderation to admins', () => {
    expect(allowed(EngagementController, 'moderate', 'ADMIN')).toBe(true);
    expect(allowed(EngagementController, 'moderate', 'CUSTOMER')).toBe(false);
  });
});
