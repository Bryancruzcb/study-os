import { Outlet } from 'react-router-dom'
import Nav from './Nav'

/* every page but home: the nav pill on the plain page, then the page as the one main
   landmark. Home is not framed and draws its own main. */
export default function Frame() {
  return (
    <div className="frame">
      <div className="wrap">
        <Nav />
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
