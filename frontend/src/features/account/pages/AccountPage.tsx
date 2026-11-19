import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Check,
  ChevronRight,
  LockKeyhole,
  LogOut,
  MapPin,
  Package,
  Pencil,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { PasswordField } from '../../auth/components/FormField';
import { Notice } from '../../auth/components/Notice';
import { errorMessage, fieldError } from '../../auth/services/auth-api';
import { useAuth } from '../../auth/hooks/useAuth';
import { getMyProfile } from '../../auth/services/auth-api';
import { useAuthStore } from '../../../context/auth-store';
import { ApiError } from '../../../services/api-client';
import {
  useChangePassword,
  useLogout,
  useUpdateProfile,
} from '../../auth/hooks/useAuthMutations';
import { Button } from '../../../components/ui/button';
import { demoOrders, formatVnd } from '../../catalog/demo-data.js';
import '../../../Account.css';
import { AddressBook } from '../components/AddressBook';

type AccountSection = 'profile' | 'addresses' | 'orders' | 'security';

export default function AccountPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const setUnauthenticated = useAuthStore((state) => state.setUnauthenticated);
  const profileQuery = useQuery({
    queryKey: ['account', 'profile'],
    queryFn: getMyProfile,
    retry: false,
  });
  const changePasswordMutation = useChangePassword();
  const logoutMutation = useLogout();
  const profileMutation = useUpdateProfile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [section, setSection] = useState<AccountSection>(() =>
    searchParams.get('section') === 'addresses' ? 'addresses' : 'profile',
  );
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [logoutError, setLogoutError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  useEffect(() => {
    if (profileQuery.data) setAuthenticated(profileQuery.data);
    if (
      profileQuery.error instanceof ApiError &&
      profileQuery.error.status === 401
    ) {
      setUnauthenticated();
      queryClient.removeQueries({ queryKey: ['cart'] });
    }
  }, [
    profileQuery.data,
    profileQuery.error,
    queryClient,
    setAuthenticated,
    setUnauthenticated,
  ]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }>();

  if (!user) return <Navigate to="/login" replace />;
  const activeSection = section;

  async function submitPassword(form: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    try {
      await changePasswordMutation.mutateAsync(form);
      navigate('/login?passwordChanged=1', { replace: true });
    } catch {
      // The API error is rendered below.
    }
  }

  async function signOut() {
    setLogoutError('');
    try {
      await logoutMutation.mutateAsync();
      navigate('/login?loggedOut=1', { replace: true });
    } catch {
      setLogoutError('Unable to revoke your session. Please try again.');
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaved(false);
    try {
      const updated = await profileMutation.mutateAsync({
        fullName,
        phone: phone.trim() || null,
      });
      setFullName(updated.fullName);
      setPhone(updated.phone ?? '');
      setProfileSaved(true);
    } catch {
      // The API error is shown beside the profile form.
    }
  }

  const menu: { id: AccountSection; label: string; icon: typeof UserRound }[] =
    [
      { id: 'profile', label: 'Personal information', icon: UserRound },
      { id: 'addresses', label: 'Address book', icon: MapPin },
      { id: 'orders', label: 'My orders', icon: Package },
      { id: 'security', label: 'Account security', icon: ShieldCheck },
    ];

  return (
    <div className="page-container account-dashboard page-section">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight />
        <span>My account</span>
      </div>
      <div className="account-dashboard-heading">
        <div>
          <span className="section-eyebrow">YOUR ACCOUNT</span>
          <h1>Hello, {user.fullName.split(' ').slice(-1)[0]}.</h1>
          <p>Manage your details, orders, and account settings.</p>
        </div>
        <button
          className="account-logout"
          onClick={() => void signOut()}
          disabled={logoutMutation.isPending}
        >
          <LogOut size={15} />
          {logoutMutation.isPending ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
      {logoutError ? <Notice>{logoutError}</Notice> : null}
      <div className="account-dashboard-grid">
        <aside className="account-sidebar">
          <div className="account-sidebar-profile">
            {user.avatarUrl ? (
              <img
                className="account-large-avatar account-large-avatar-image"
                src={user.avatarUrl}
                alt={`Profile picture of ${user.fullName}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="account-large-avatar">
                {initials(fullName || user.fullName)}
              </span>
            )}
            <div>
              <strong>{fullName || user.fullName}</strong>
              <small>{user.email}</small>
            </div>
            <span className="account-role">
              {user.role === 'ADMIN' ? 'Administrator' : 'Customer'}
            </span>
          </div>
          <nav aria-label="Account navigation">
            {menu.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={activeSection === id ? 'active' : ''}
                  onClick={() => {
                    setSection(id);
                    if (id === 'addresses') setSearchParams({ section: id });
                    else setSearchParams({});
                  }}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
            {user ? (
              <Link className="account-nav-notifications" to="/notifications">
                <Bell size={17} />
                <span>Notifications</span>
                <ChevronRight size={14} />
              </Link>
            ) : null}
            {user.role === 'ADMIN' ? (
              <Link className="account-admin-link" to="/admin">
                <ShieldCheck size={17} />
                <span>Admin area</span>
                <ArrowRight size={14} />
              </Link>
            ) : null}
          </nav>
          <div className="account-help">
            <span>
              <Bell size={15} />
            </span>
            <p>Need help with your account?</p>
            <a href="mailto:hello@nexora.vn">Contact Nexora</a>
          </div>
        </aside>
        <section className="account-content">
          {activeSection === 'profile' ? (
            <div className="account-panel">
              <div className="account-panel-title">
                <div>
                  <span className="section-eyebrow">YOUR PROFILE</span>
                  <h2>Personal information</h2>
                  <p>Update your contact details.</p>
                </div>
                {user ? (
                  <span className="subtle-icon" aria-hidden="true">
                    <Pencil size={16} />
                  </span>
                ) : null}
              </div>
              <form className="profile-form" onSubmit={saveProfile}>
                <label>
                  Full name
                  <input
                    value={fullName}
                    required
                    minLength={1}
                    maxLength={100}
                    disabled={profileMutation.isPending}
                    onChange={(event) => {
                      setFullName(event.target.value);
                    }}
                  />
                </label>
                <label>
                  Email
                  <input value={user.email} disabled />
                  <small>Your sign-in email cannot be changed.</small>
                </label>
                <label>
                  Phone number
                  <input
                    value={phone}
                    maxLength={30}
                    disabled={profileMutation.isPending}
                    onChange={(event) => {
                      setPhone(event.target.value);
                    }}
                    placeholder="Enter phone number"
                  />
                </label>
                <label>
                  Account created
                  <input
                    value={new Date(user.createdAt).toLocaleDateString(
                      'vi-VN',
                      { timeZone: 'Asia/Ho_Chi_Minh' },
                    )}
                    disabled
                  />
                </label>
                <div className="profile-form-footer">
                  <span aria-live="polite">
                    {profileSaved ? (
                      <>
                        <Check size={14} /> Changes saved.
                      </>
                    ) : (
                      'Your sign-in email is read-only.'
                    )}
                  </span>
                  {user ? (
                    <button
                      className="button-primary"
                      type="submit"
                      disabled={
                        profileMutation.isPending ||
                        fullName.trim().length === 0
                      }
                    >
                      {profileMutation.isPending
                        ? 'Saving...'
                        : 'Save changes'}{' '}
                      <ArrowRight size={15} />
                    </button>
                  ) : null}
                </div>
                {profileMutation.error ? (
                  <Notice>
                    {errorMessage(
                      profileMutation.error,
                      'Unable to save your profile. Please try again.',
                    )}
                  </Notice>
                ) : null}
              </form>
              <div className="email-security-banner">
                <span>
                  <BadgeCheck />
                </span>
                <div>
                  <strong>Sign-in email</strong>
                  <small>This email is used to sign in to your account.</small>
                </div>
              </div>
            </div>
          ) : null}
          {activeSection === 'addresses' ? <AddressBook /> : null}
          {activeSection === 'orders' ? (
            <div className="account-panel">
              <div className="account-panel-title">
                <div>
                  <span className="section-eyebrow">YOUR SHOPPING</span>
                  <h2>My orders</h2>
                  <p>Track your recent orders.</p>
                </div>
                <Link className="text-link" to="/orders">
                  View all <ArrowRight size={15} />
                </Link>
              </div>
              <div className="account-order-list">
                {demoOrders.slice(0, 2).map((order) => (
                  <Link
                    className="account-order-card"
                    to={`/orders/${order.id}`}
                    key={order.id}
                  >
                    <span className="account-order-icon">
                      <Package />
                    </span>
                    <span>
                      <strong>{order.id}</strong>
                      <small>
                        {order.date} · {order.items.length} products
                      </small>
                    </span>
                    <span
                      className={`order-status ${order.status === 'Đang giao' ? 'in-progress' : 'complete'}`}
                    >
                      <i />
                      {order.status === 'Đang giao' ? 'Shipping' : 'Delivered'}
                    </span>
                    <strong>{formatVnd(order.total)}</strong>
                    <ChevronRight size={15} />
                  </Link>
                ))}
              </div>
              <Link
                className="button-secondary account-see-orders"
                to="/orders"
              >
                Order history <ArrowRight size={15} />
              </Link>
            </div>
          ) : null}
          {activeSection === 'security' ? (
            <div className="account-panel">
              <div className="account-panel-title">
                <div>
                  <span className="section-eyebrow">ACCOUNT SECURITY</span>
                  <h2>Security & sign-in</h2>
                  <p>Keep your account safe and private.</p>
                </div>
                <span className="security-shield">
                  <ShieldCheck />
                </span>
              </div>
              <div className="security-status">
                <span>
                  <BadgeCheck />
                </span>
                <div>
                  <strong>Account active</strong>
                  <small>Email verified · Session protected</small>
                </div>
                <span className="active-pill">ACTIVE</span>
              </div>
              <div className="account-password-section">
                <div className="account-subheading">
                  <LockKeyhole />
                  <div>
                    <h3>Change password</h3>
                    <p>A strong password helps protect your information.</p>
                  </div>
                </div>
                {changePasswordMutation.error ? (
                  <Notice>
                    {errorMessage(
                      changePasswordMutation.error,
                      'Unable to change your password. Please try again.',
                    )}
                  </Notice>
                ) : null}
                <form
                  className="account-password-form"
                  onSubmit={handleSubmit(submitPassword)}
                >
                  <PasswordField
                    label="Current password"
                    autoComplete="current-password"
                    {...register('currentPassword', {
                      required: 'Enter your current password.',
                    })}
                    error={
                      errors.currentPassword?.message ??
                      fieldError(
                        changePasswordMutation.error,
                        'currentPassword',
                      )
                    }
                  />
                  <div className="password-row">
                    <PasswordField
                      label="New password"
                      autoComplete="new-password"
                      {...register('newPassword', {
                        required: 'Enter a new password.',
                        minLength: {
                          value: 6,
                          message: 'Password must be at least 6 characters.',
                        },
                      })}
                      error={
                        errors.newPassword?.message ??
                        fieldError(changePasswordMutation.error, 'newPassword')
                      }
                    />
                    <PasswordField
                      label="Confirm new password"
                      autoComplete="new-password"
                      {...register('confirmPassword', {
                        required: 'Confirm new password.',
                        validate: (value, values) =>
                          value === values.newPassword ||
                          'Passwords do not match.',
                      })}
                      error={
                        errors.confirmPassword?.message ??
                        fieldError(
                          changePasswordMutation.error,
                          'confirmPassword',
                        )
                      }
                    />
                  </div>
                  <div className="password-form-footer">
                    <span>You will need to sign in again after changing your password.</span>
                    <Button
                      className="primary-button"
                      type="submit"
                      disabled={changePasswordMutation.isPending}
                    >
                      {changePasswordMutation.isPending
                        ? 'Updating...'
                        : 'Update password'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
