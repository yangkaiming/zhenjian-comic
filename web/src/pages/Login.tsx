import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';

const REMEMBER_ACC_KEY = 'zj_remember_account';
const REMEMBER_PWD_KEY = 'zj_remember_password';

// 记住密码时仅做可逆混淆后再落盘，避免密码以明文形式出现在 localStorage
const PWD_KEY_XOR = 'zj_comic_pwd_2024';
function xorEncode(s: string): string {
  let o = '';
  for (let i = 0; i < s.length; i += 1) {
    o += String.fromCharCode(s.charCodeAt(i) ^ PWD_KEY_XOR.charCodeAt(i % PWD_KEY_XOR.length));
  }
  return btoa(unescape(encodeURIComponent(o)));
}
function xorDecode(b: string): string {
  try {
    const o = decodeURIComponent(escape(atob(b)));
    let s = '';
    for (let i = 0; i < o.length; i += 1) {
      s += String.fromCharCode(o.charCodeAt(i) ^ PWD_KEY_XOR.charCodeAt(i % PWD_KEY_XOR.length));
    }
    return s;
  } catch {
    return '';
  }
}

export default function Login() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState(() => localStorage.getItem(REMEMBER_ACC_KEY) || '');
  const [password, setPassword] = useState(() => {
    const v = localStorage.getItem(REMEMBER_PWD_KEY);
    return v ? xorDecode(v) : '';
  });
  const [nickname, setNickname] = useState('');
  const [rememberAcc, setRememberAcc] = useState(() => !!localStorage.getItem(REMEMBER_ACC_KEY));
  const [rememberPwd, setRememberPwd] = useState(() => !!localStorage.getItem(REMEMBER_PWD_KEY));
  const [loading, setLoading] = useState(false);
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();

  const submit = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error('请填写用户名和密码');
      return;
    }
    setLoading(true);
    try {
      if (tab === 'login') {
        await login(username.trim(), password);
        // 登录成功后按勾选情况存/清缓存
        if (rememberAcc) localStorage.setItem(REMEMBER_ACC_KEY, username.trim());
        else localStorage.removeItem(REMEMBER_ACC_KEY);
        if (rememberPwd) localStorage.setItem(REMEMBER_PWD_KEY, xorEncode(password));
        else localStorage.removeItem(REMEMBER_PWD_KEY);
        toast.success('登录成功');
      } else {
        await register(username.trim(), password, nickname.trim() || username.trim());
        toast.success('注册成功，已自动登录');
      }
      navigate('/');
    } catch (e) {
      toast.error((e as Error).message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <h2 className="auth-title">{tab === 'login' ? '登录帧间漫画' : '注册新账号'}</h2>
      <div className="row" style={{ marginBottom: 16, gap: 8 }}>
        <button className={`chip${tab === 'login' ? ' active' : ''}`} onClick={() => setTab('login')}>
          登录
        </button>
        <button className={`chip${tab === 'register' ? ' active' : ''}`} onClick={() => setTab('register')}>
          注册
        </button>
      </div>

      <div className="field">
        <label>用户名</label>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="field">
        <label>密码（至少 6 位）</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      {tab === 'register' && (
        <div className="field">
          <label>昵称（可选）</label>
          <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
      )}

      {tab === 'login' && (
        <div className="remember-row">
          <label className="remember-item">
            <input type="checkbox" checked={rememberAcc} onChange={(e) => setRememberAcc(e.target.checked)} />
            <span>记住账号</span>
          </label>
          <label className="remember-item">
            <input type="checkbox" checked={rememberPwd} onChange={(e) => setRememberPwd(e.target.checked)} />
            <span>记住密码</span>
          </label>
        </div>
      )}

      <button className="btn btn-primary" style={{ width: '100%', height: 38 }} disabled={loading} onClick={submit}>
        {loading ? '处理中…' : tab === 'login' ? '登录' : '注册并登录'}
      </button>

      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <button className="link-more" onClick={() => navigate('/')}>
          先逛逛，稍后再登录 →
        </button>
      </div>
    </div>
  );
}
