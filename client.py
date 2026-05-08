import tkinter as tk
from tkinter import ttk, messagebox
import requests
import hashlib
import platform
import uuid
import urllib.request
import urllib.error
import json
import os
import sys

SERVER_URL = 'https://your-domain.com'

def get_hwid():
    parts = [
        platform.system(),
        platform.machine(),
        platform.processor(),
        str(uuid.getnode()),
        platform.node()
    ]
    raw = '-'.join(parts).encode()
    hwid = hashlib.sha256(raw).hexdigest()[:16].upper()
    device_type = 'PC'
    if platform.system() == 'Linux' and 'Android' in platform.version():
        device_type = 'Android'
    elif platform.system() == 'Windows':
        device_type = 'PC'
    return f'HWID-{hwid}-{device_type}'

def resource_path(relative_path):
    if getattr(sys, 'frozen', False):
        base_path = os.path.dirname(sys.executable)
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

class ActivationApp:
    def __init__(self):
        self.window = tk.Tk()
        self.window.title('TeraShield - Key Activation')
        self.window.geometry('520x380')
        self.window.resizable(False, False)
        self.window.configure(bg='#f0f2f5')

        try:
            self.window.iconbitmap(resource_path('icon.ico'))
        except:
            pass

        self.style = ttk.Style()
        self.style.theme_use('clam')

        header = tk.Frame(self.window, bg='#1a5276', pady=16)
        header.pack(fill='x')
        tk.Label(header, text='TERA SHIELD', font=('Segoe UI', 18, 'bold'), fg='white', bg='#1a5276').pack()
        tk.Label(header, text='Key Activation', font=('Segoe UI', 10), fg='#aed6f1', bg='#1a5276').pack()

        main_frame = tk.Frame(self.window, bg='#f0f2f5', padx=30, pady=20)
        main_frame.pack(fill='both', expand=True)

        tk.Label(main_frame, text='Enter your key:', font=('Segoe UI', 11, 'bold'), fg='#333', bg='#f0f2f5').pack(anchor='w')
        entry_frame = tk.Frame(main_frame, bg='#f0f2f5')
        entry_frame.pack(fill='x', pady=(6, 4))
        self.key_entry = tk.Entry(entry_frame, font=('Consolas', 13), bg='white', fg='#333', relief='solid', bd=1, insertbackground='#333')
        self.key_entry.pack(side='left', fill='x', expand=True, ipady=4)
        self.key_entry.focus()
        paste_btn = tk.Button(entry_frame, text='PASTE', font=('Segoe UI', 9, 'bold'), fg='white', bg='#2e86c1', relief='flat', padx=10, cursor='hand2', command=self.paste_key)
        paste_btn.pack(side='left', padx=(6, 0))
        paste_btn.bind('<Enter>', lambda e: paste_btn.configure(bg='#1a5276'))
        paste_btn.bind('<Leave>', lambda e: paste_btn.configure(bg='#2e86c1'))

        info_frame = tk.Frame(main_frame, bg='#f0f2f5')
        info_frame.pack(fill='x', pady=(0, 10))

        tk.Label(info_frame, text='HWID:', font=('Segoe UI', 9), fg='#666', bg='#f0f2f5').pack(side='left')
        self.hwid_label = tk.Label(info_frame, text=get_hwid(), font=('Consolas', 9), fg='#2e86c1', bg='#f0f2f5')
        self.hwid_label.pack(side='left', padx=(4, 0))

        self.status_label = tk.Label(main_frame, text='', font=('Segoe UI', 10), fg='#e74c3c', bg='#f0f2f5', anchor='w')
        self.status_label.pack(fill='x', pady=(0, 10))

        self.activate_btn = tk.Button(main_frame, text='ACTIVATE KEY', font=('Segoe UI', 12, 'bold'), fg='white', bg='#2e86c1', activebackground='#1a5276', activeforeground='white', relief='flat', pady=10, cursor='hand2', command=self.activate_key)
        self.activate_btn.pack(fill='x', pady=(4, 0))
        self.activate_btn.bind('<Enter>', lambda e: self.activate_btn.configure(bg='#1a5276'))
        self.activate_btn.bind('<Leave>', lambda e: self.activate_btn.configure(bg='#2e86c1'))

        self.check_btn = tk.Button(main_frame, text='Check Key', font=('Segoe UI', 9), fg='#666', bg='white', relief='solid', bd=1, padx=12, pady=4, cursor='hand2', command=self.check_key)
        self.check_btn.pack(pady=(10, 0))

        footer = tk.Frame(self.window, bg='#e8ecf1', pady=8)
        footer.pack(fill='x', side='bottom')
        tk.Label(footer, text='TeraShield Anti-Cheat System', font=('Segoe UI', 8), fg='#999', bg='#e8ecf1').pack()

        self.window.protocol('WM_DELETE_WINDOW', self.on_close)
        self.center_window()
        self.window.mainloop()

    def center_window(self):
        self.window.update_idletasks()
        w = self.window.winfo_width()
        h = self.window.winfo_height()
        x = (self.window.winfo_screenwidth() // 2) - (w // 2)
        y = (self.window.winfo_screenheight() // 2) - (h // 2)
        self.window.geometry(f'+{x}+{y}')

    def paste_key(self):
        try:
            clipboard = self.window.clipboard_get()
            self.key_entry.delete(0, 'end')
            self.key_entry.insert(0, clipboard.strip())
        except:
            pass

    def check_key(self):
        key = self.key_entry.get().strip()
        if not key:
            self.status_label.config(text='Enter a key first', fg='#e74c3c')
            return

        try:
            resp = requests.get(f'{SERVER_URL}/api.php?action=activate/key={key}', timeout=5)
            data = resp.json()
            if not data.get('exists'):
                self.status_label.config(text='Key not found', fg='#e74c3c')
            elif data.get('frozen'):
                self.status_label.config(text='Key is frozen', fg='#e67e22')
            elif data.get('active'):
                hwid = data.get('hwid', '')
                self.status_label.config(text=f'Key is ACTIVE on HWID: {hwid}', fg='#27ae60')
            else:
                self.status_label.config(text='Key is available (not activated)', fg='#27ae60')
        except requests.exceptions.ConnectionError:
            self.status_label.config(text='Cannot connect to server', fg='#e74c3c')
        except Exception as e:
            self.status_label.config(text=f'Error: {str(e)}', fg='#e74c3c')

    def activate_key(self):
        key = self.key_entry.get().strip()
        if not key:
            self.status_label.config(text='Enter a key first', fg='#e74c3c')
            return

        self.activate_btn.config(state='disabled', text='Activating...')
        hwid = get_hwid()

        try:
            resp = requests.post(
                f'{SERVER_URL}/api.php?action=connect',
                json={'key': key, 'hwid': hwid},
                timeout=10
            )
            data = resp.json()

            if data.get('success'):
                self.status_label.config(
                    text=f'Activated! Key: {data["key"]} | Duration: {data["duration"]} days',
                    fg='#27ae60'
                )
                messagebox.showinfo('Success', f'Key activated successfully!\n\nDuration: {data["duration"]} days\nHWID: {hwid}')
            else:
                self.status_label.config(text=data.get('error', 'Activation failed'), fg='#e74c3c')
                messagebox.showerror('Error', data.get('error', 'Activation failed'))

        except requests.exceptions.ConnectionError:
            self.status_label.config(text='Cannot connect to server', fg='#e74c3c')
            messagebox.showerror('Connection Error', 'Cannot connect to the activation server.\nMake sure the server is running.')
        except Exception as e:
            self.status_label.config(text=f'Error: {str(e)}', fg='#e74c3c')
        finally:
            self.activate_btn.config(state='normal', text='ACTIVATE KEY')

    def on_close(self):
        if messagebox.askyesno('Exit', 'Are you sure you want to exit?'):
            self.window.destroy()

if __name__ == '__main__':
    print(f'[TeraShield] HWID: {get_hwid()}')
    print('[TeraShield] Client starting...')
    try:
        ActivationApp()
    except Exception as e:
        print(f'[Error] {e}')
        input('Press Enter to exit...')
